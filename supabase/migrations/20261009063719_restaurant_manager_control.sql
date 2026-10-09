begin;
alter table public.restaurant_venues
 add column created_by uuid references auth.users(id),
 add column theme text not null default 'glass-bistro' check(theme in ('glass-bistro','garden','heritage','coastal','midnight','cafe')),
 add column restaurant_type text not null default 'Bistro',
 add column suspended boolean not null default false,
 add column agent_support boolean not null default true;
update public.restaurant_venues set created_by=owner_id;
alter table public.restaurant_venues alter column created_by set default auth.uid(), alter column created_by set not null;
create index restaurant_venues_creator on public.restaurant_venues(created_by);
create table public.restaurant_manager_access (
 venue_id uuid not null references public.restaurant_venues(id),
 user_id uuid not null references auth.users(id),
 name text not null, email text not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(venue_id,user_id)
);
create index restaurant_manager_user on public.restaurant_manager_access(user_id);
create table public.restaurant_commissions (
 venue_id uuid primary key references public.restaurant_venues(id),
 agent_id uuid not null references auth.users(id),
 amount numeric(12,2) not null default 0 check(amount>=0),
 currency text not null default 'INR' check(currency in ('INR','AED','GBP','USD','EUR')),
 status text not null default 'pending' check(status in ('pending','approved','paid','rejected')),
 note text not null default '' check(length(note)<=1000),
 updated_by uuid references auth.users(id),
 paid_at timestamptz, updated_at timestamptz not null default now()
);
create index restaurant_commission_agent on public.restaurant_commissions(agent_id);
alter table public.restaurant_manager_access enable row level security;
alter table public.restaurant_commissions enable row level security;
-- Private lookup helpers avoid recursive venue/access policies. Caller identity
-- is mandatory; these never trust user-editable metadata.
create function private.restaurant_can_read(p_venue uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_admin() or exists(
 select 1 from public.restaurant_venues v where v.id=p_venue and (
 ((v.created_by=auth.uid() or (v.owner_id=auth.uid() and v.agent_support)) and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))
 or exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.user_id=auth.uid() and a.active))));
$$;
create function private.restaurant_can_manage(p_venue uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_admin() or exists(
 select 1 from public.restaurant_venues v where v.id=p_venue and not v.suspended and (
 (v.owner_id=auth.uid() and v.agent_support and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))
 or exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.user_id=auth.uid() and a.active))));
$$;
revoke all on function private.restaurant_can_read(uuid),private.restaurant_can_manage(uuid) from public,anon;
grant execute on function private.restaurant_can_read(uuid),private.restaurant_can_manage(uuid) to authenticated,service_role;
create function private.restaurant_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' and auth.uid() is not null then
   new.created_by=auth.uid(); new.owner_id=auth.uid();
 elsif TG_OP='UPDATE' and new.created_by is distinct from old.created_by then
   raise exception 'Setup attribution cannot be changed';
 end if;
 return new;
end $$;
revoke all on function private.restaurant_identity_guard() from public;
create trigger restaurant_identity_guard before insert or update on public.restaurant_venues for each row execute function private.restaurant_identity_guard();
drop policy venue_read on public.restaurant_venues;
drop policy venue_create on public.restaurant_venues;
drop policy venue_edit on public.restaurant_venues;
create policy venue_read on public.restaurant_venues for select to authenticated using(private.restaurant_can_read(id));
create policy venue_create on public.restaurant_venues for insert to authenticated with check(
 created_by=auth.uid() and owner_id=auth.uid() and not suspended and agent_support and exists(select 1 from public.profiles where id=auth.uid() and active));
create policy venue_edit on public.restaurant_venues for update to authenticated using(private.restaurant_can_manage(id)) with check(private.restaurant_can_manage(id));
revoke update on public.restaurant_venues from authenticated;
grant update(name,tagline,address,logo_url,cover_url,accent,currency,google_url,instagram_url,wifi_ssid,wifi_password,wifi_enabled,loyalty_enabled,reward_name,reward_target,menu,published,theme,restaurant_type) on public.restaurant_venues to authenticated;
drop policy feedback_read on public.restaurant_feedback;
drop policy feedback_edit on public.restaurant_feedback;
drop policy member_read on public.restaurant_members;
drop policy member_edit on public.restaurant_members;
drop policy event_read on public.restaurant_events;
create policy feedback_read on public.restaurant_feedback for select to authenticated using(private.restaurant_can_manage(venue_id));
create policy feedback_edit on public.restaurant_feedback for update to authenticated using(private.restaurant_can_manage(venue_id)) with check(private.restaurant_can_manage(venue_id));
create policy member_read on public.restaurant_members for select to authenticated using(private.restaurant_can_manage(venue_id));
create policy member_edit on public.restaurant_members for update to authenticated using(private.restaurant_can_manage(venue_id)) with check(private.restaurant_can_manage(venue_id));
create policy event_read on public.restaurant_events for select to authenticated using(private.restaurant_can_read(venue_id));
create policy manager_read on public.restaurant_manager_access for select to authenticated using(
 user_id=auth.uid() or private.is_admin() or exists(select 1 from public.restaurant_venues v where v.id=venue_id and v.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)));
create policy commission_read on public.restaurant_commissions for select to authenticated using(private.is_admin() or (agent_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)));
create policy commission_create on public.restaurant_commissions for insert to authenticated with check(private.is_admin() and exists(select 1 from public.restaurant_venues v where v.id=venue_id and v.created_by=agent_id));
create policy commission_update on public.restaurant_commissions for update to authenticated using(private.is_admin()) with check(private.is_admin() and exists(select 1 from public.restaurant_venues v where v.id=venue_id and v.created_by=agent_id));
create function private.restaurant_commission_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Only an administrator can change commissions'; end if;
 if new.status='paid' and (TG_OP='INSERT' or old.status not in ('approved','paid')) then raise exception 'Approve this setup before recording payment'; end if;
 if new.status in ('approved','paid') and not exists(select 1 from public.restaurant_venues v where v.id=new.venue_id and v.published and not v.suspended and jsonb_array_length(v.menu)>0 and exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.active)) then raise exception 'Publish a menu and create active manager access before approving commission'; end if;
 new.updated_by=auth.uid(); new.updated_at=now();
 if new.status='paid' then new.paid_at=coalesce(old.paid_at,now()); else new.paid_at=null; end if;
 return new;
end $$;
revoke all on function private.restaurant_commission_guard() from public;
create trigger restaurant_commission_guard before insert or update on public.restaurant_commissions for each row execute function private.restaurant_commission_guard();
grant select on public.restaurant_manager_access,public.restaurant_commissions to authenticated;
grant insert,update on public.restaurant_commissions to authenticated;
grant all on public.restaurant_manager_access,public.restaurant_commissions to service_role;
-- Restaurant-only identities cannot gain field-worker access via their profile.
create function private.restaurant_profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users u where u.id=new.id and u.raw_app_meta_data->>'account_type'='restaurant_manager') then new.active=false; end if;
 return new;
end $$;
revoke all on function private.restaurant_profile_guard() from public;
create trigger restaurant_profile_guard before insert or update on public.profiles for each row execute function private.restaurant_profile_guard();
-- Unique, immutable uploads: replacement gets a new URL and needs no delete/upsert.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('restaurant-images','restaurant-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create function private.restaurant_image_access(p_name text) returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 if split_part(p_name,'/',1) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
 return private.restaurant_can_manage(split_part(p_name,'/',1)::uuid);
end $$;
revoke all on function private.restaurant_image_access(text) from public,anon;
grant execute on function private.restaurant_image_access(text) to authenticated;
create policy restaurant_image_insert on storage.objects for insert to authenticated with check(bucket_id='restaurant-images' and private.restaurant_image_access(name));
commit;
