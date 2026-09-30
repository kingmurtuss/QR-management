-- QR Field Ops - Supabase setup / upgrade
-- Safe principle: QR numbers come from a sequence and are never reused.
-- Admins may delete ONLY completely unused QR rows.
-- Run in Supabase SQL Editor as a project owner.

create extension if not exists pgcrypto;
create schema if not exists private;

create sequence if not exists public.qr_code_number_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'worker' check (role in ('admin','worker')),
  name text not null default 'User',
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists active boolean not null default true;

create table if not exists public.settings (
  id boolean primary key default true check (id = true),
  company_name text not null default 'QR Field Ops',
  commission_rate numeric(12,2) not null default 100,
  qr_base_url text,
  updated_at timestamptz not null default now()
);

insert into public.settings(id, company_name, commission_rate)
values (true, 'QR Field Ops', 100)
on conflict (id) do nothing;

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'available' check (status in ('available','assigned','active','disabled')),
  worker_id uuid references public.profiles(id) on delete set null,
  business_id uuid,
  scan_count bigint not null default 0,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  activated_at timestamptz
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  qr_id uuid not null unique references public.qr_codes(id) on delete restrict,
  name text not null,
  owner_name text,
  phone text,
  category text,
  address text,
  area text,
  city text,
  google_review_url text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_codes_business_id_fkey'
      and conrelid = 'public.qr_codes'::regclass
  ) then
    alter table public.qr_codes
      add constraint qr_codes_business_id_fkey
      foreign key (business_id) references public.businesses(id) on delete restrict;
  end if;
end $$;

create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  qr_id uuid not null references public.qr_codes(id) on delete restrict,
  business_id uuid references public.businesses(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  user_agent text,
  ip text,
  referer text
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null,
  payment_details text,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null,
  message text not null,
  reply text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  shop_name text not null,
  phone text,
  service text,
  preferred_at timestamptz,
  notes text,
  status text not null default 'requested' check (status in ('requested','confirmed','done','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qr_codes_status_idx on public.qr_codes(status);
create index if not exists qr_codes_worker_idx on public.qr_codes(worker_id);
create index if not exists businesses_worker_idx on public.businesses(worker_id);
create index if not exists withdrawals_worker_idx on public.withdrawals(worker_id);
create index if not exists tickets_worker_idx on public.tickets(worker_id);
create index if not exists appointments_worker_idx on public.appointments(worker_id);
create index if not exists qr_scans_qr_idx on public.qr_scans(qr_id, scanned_at desc);

-- Keep the sequence permanently ahead of every QR code that already exists.
select setval(
  'public.qr_code_number_seq',
  greatest(
    coalesce((select max(substring(code from '[0-9]+')::bigint) from public.qr_codes where code ~ '^QR[0-9]+$'), 0),
    (select last_value from public.qr_code_number_seq)
  ),
  true
);

create or replace function private.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id and role = 'admin' and active = true
  );
$$;

revoke all on function private.is_admin(uuid) from public;
grant execute on function private.is_admin(uuid) to authenticated, service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles(id, role, name, email, active)
  values (
    new.id,
    'worker',
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,'User'),'@',1),
      'User'
    ),
    new.email,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        name = case
          when public.profiles.name is null or public.profiles.name = '' or public.profiles.name = 'User'
            then excluded.name
          else public.profiles.name
        end;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.handle_new_user();

-- Backfill profiles for existing Auth users if needed.
insert into public.profiles(id, role, name, email, active)
select
  u.id,
  'worker',
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name',''),
    nullif(u.raw_user_meta_data->>'name',''),
    split_part(coalesce(u.email,'User'),'@',1),
    'User'
  ),
  u.email,
  true
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Database-level guard: even privileged accidental deletes cannot remove used QR history.
create or replace function private.protect_qr_history_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'available'
     or old.worker_id is not null
     or old.business_id is not null
     or old.assigned_at is not null
     or old.activated_at is not null
     or coalesce(old.scan_count,0) <> 0
     or exists (select 1 from public.qr_scans s where s.qr_id = old.id)
     or exists (select 1 from public.businesses b where b.qr_id = old.id)
  then
    raise exception 'Only completely unused QR codes can be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_qr_history_delete on public.qr_codes;
create trigger protect_qr_history_delete
before delete on public.qr_codes
for each row execute function private.protect_qr_history_delete();

create or replace function public.generate_qr_codes(p_count integer)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  i integer;
  n bigint;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  for i in 1..p_count loop
    n := nextval('public.qr_code_number_seq');
    insert into public.qr_codes(code, status)
    values ('QR' || lpad(n::text, 5, '0'), 'available');
  end loop;

  return p_count;
end;
$$;

revoke all on function public.generate_qr_codes(integer) from public;
grant execute on function public.generate_qr_codes(integer) to authenticated;

create or replace function public.assign_qrs_to_worker(p_worker_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  updated_count integer;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_worker_id and role = 'worker' and active = true
  ) then
    raise exception 'Worker not found or inactive';
  end if;

  with picked as (
    select id
    from public.qr_codes
    where status = 'available'
      and worker_id is null
      and business_id is null
    order by created_at asc, code asc
    limit p_count
    for update skip locked
  )
  update public.qr_codes q
  set worker_id = p_worker_id,
      status = 'assigned',
      assigned_at = now()
  from picked
  where q.id = picked.id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.assign_qrs_to_worker(uuid, integer) from public;
grant execute on function public.assign_qrs_to_worker(uuid, integer) to authenticated;

create or replace function public.onboard_business(
  p_qr_id uuid,
  p_name text,
  p_owner_name text default null,
  p_phone text default null,
  p_category text default null,
  p_address text default null,
  p_area text default null,
  p_city text default null,
  p_google_review_url text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_business_id uuid := gen_random_uuid();
  qr public.qr_codes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into qr
  from public.qr_codes
  where id = p_qr_id
  for update;

  if not found then raise exception 'QR not found'; end if;
  if qr.worker_id <> auth.uid() then raise exception 'This QR is not assigned to you'; end if;
  if qr.status <> 'assigned' or qr.business_id is not null then
    raise exception 'QR is not available for onboarding';
  end if;
  if nullif(trim(p_name),'') is null then raise exception 'Business name is required'; end if;
  if nullif(trim(p_google_review_url),'') is null
     or p_google_review_url !~* '^https?://' then
    raise exception 'A valid Google Review URL is required';
  end if;

  insert into public.businesses(
    id, worker_id, qr_id, name, owner_name, phone, category, address, area, city,
    google_review_url, latitude, longitude
  ) values (
    new_business_id, auth.uid(), p_qr_id, trim(p_name), nullif(trim(p_owner_name),''),
    nullif(trim(p_phone),''), nullif(trim(p_category),''), nullif(trim(p_address),''),
    nullif(trim(p_area),''), nullif(trim(p_city),''), trim(p_google_review_url),
    p_latitude, p_longitude
  );

  update public.qr_codes
  set business_id = new_business_id,
      status = 'active',
      activated_at = now()
  where id = p_qr_id;

  return new_business_id;
end;
$$;

revoke all on function public.onboard_business(uuid,text,text,text,text,text,text,text,text,double precision,double precision) from public;
grant execute on function public.onboard_business(uuid,text,text,text,text,text,text,text,text,double precision,double precision) to authenticated;

create or replace function public.resolve_qr_scan(
  p_code text,
  p_user_agent text default null,
  p_ip text default null,
  p_referer text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  q public.qr_codes%rowtype;
  b public.businesses%rowtype;
begin
  select * into q
  from public.qr_codes
  where upper(code) = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if not found or q.business_id is null then
    raise exception 'QR not found or inactive';
  end if;

  select * into b from public.businesses where id = q.business_id;
  if not found or nullif(trim(b.google_review_url),'') is null then
    raise exception 'Review URL missing';
  end if;

  insert into public.qr_scans(qr_id,business_id,user_agent,ip,referer)
  values(q.id,b.id,p_user_agent,p_ip,p_referer);

  update public.qr_codes
  set scan_count = coalesce(scan_count,0) + 1
  where id = q.id;

  return jsonb_build_object(
    'code', q.code,
    'business_id', b.id,
    'review_url', b.google_review_url
  );
end;
$$;

revoke all on function public.resolve_qr_scan(text,text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_qr_scan(text,text,text,text) to service_role;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.qr_codes enable row level security;
alter table public.businesses enable row level security;
alter table public.qr_scans enable row level security;
alter table public.withdrawals enable row level security;
alter table public.tickets enable row level security;
alter table public.appointments enable row level security;
alter table public.activity_logs enable row level security;

-- Drop known policy names so this file can be rerun.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists settings_select on public.settings;
drop policy if exists settings_admin_update on public.settings;
drop policy if exists qr_select on public.qr_codes;
drop policy if exists qr_admin_delete_unused on public.qr_codes;
drop policy if exists businesses_select on public.businesses;
drop policy if exists businesses_admin_update on public.businesses;
drop policy if exists withdrawals_select on public.withdrawals;
drop policy if exists withdrawals_insert_own on public.withdrawals;
drop policy if exists withdrawals_admin_update on public.withdrawals;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert_own on public.tickets;
drop policy if exists tickets_admin_update on public.tickets;
drop policy if exists appointments_select on public.appointments;
drop policy if exists appointments_insert_own on public.appointments;
drop policy if exists appointments_admin_update on public.appointments;
drop policy if exists activity_insert_own on public.activity_logs;
drop policy if exists activity_admin_select on public.activity_logs;

create policy profiles_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.is_admin((select auth.uid())));

create policy profiles_admin_update on public.profiles
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy settings_select on public.settings
for select to authenticated using (true);

create policy settings_admin_update on public.settings
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy qr_select on public.qr_codes
for select to authenticated
using (
  private.is_admin((select auth.uid()))
  or worker_id = (select auth.uid())
);

create policy qr_admin_delete_unused on public.qr_codes
for delete to authenticated
using (
  private.is_admin((select auth.uid()))
  and status = 'available'
  and worker_id is null
  and business_id is null
  and assigned_at is null
  and activated_at is null
  and coalesce(scan_count,0) = 0
);

create policy businesses_select on public.businesses
for select to authenticated
using (
  private.is_admin((select auth.uid()))
  or worker_id = (select auth.uid())
);

create policy businesses_admin_update on public.businesses
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy withdrawals_select on public.withdrawals
for select to authenticated
using (private.is_admin((select auth.uid())) or worker_id = (select auth.uid()));

create policy withdrawals_insert_own on public.withdrawals
for insert to authenticated
with check (worker_id = (select auth.uid()) and status = 'pending');

create policy withdrawals_admin_update on public.withdrawals
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy tickets_select on public.tickets
for select to authenticated
using (private.is_admin((select auth.uid())) or worker_id = (select auth.uid()));

create policy tickets_insert_own on public.tickets
for insert to authenticated
with check (worker_id = (select auth.uid()) and status = 'open');

create policy tickets_admin_update on public.tickets
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy appointments_select on public.appointments
for select to authenticated
using (private.is_admin((select auth.uid())) or worker_id = (select auth.uid()));

create policy appointments_insert_own on public.appointments
for insert to authenticated
with check (worker_id = (select auth.uid()));

create policy appointments_admin_update on public.appointments
for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

create policy activity_insert_own on public.activity_logs
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy activity_admin_select on public.activity_logs
for select to authenticated
using (private.is_admin((select auth.uid())));

grant usage on schema public to authenticated;
grant select on public.profiles, public.settings, public.qr_codes, public.businesses,
  public.withdrawals, public.tickets, public.appointments, public.activity_logs
to authenticated;

grant insert on public.withdrawals, public.tickets, public.appointments, public.activity_logs
to authenticated;

grant update on public.profiles, public.settings, public.businesses,
  public.withdrawals, public.tickets, public.appointments
to authenticated;

grant delete on public.qr_codes to authenticated;

-- The service_role / modern Supabase secret key handles public QR scan resolution.
grant select, insert, update on public.qr_codes, public.businesses, public.qr_scans to service_role;
grant usage, select on sequence public.qr_scans_id_seq to service_role;

-- IMPORTANT: promote only your own trusted admin account.
-- Example:
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL@example.com';
