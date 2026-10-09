begin;
-- Auth provisioning succeeded, but the subsequent profile update failed because
-- service_role could not use the private schema called by the profile trigger.
grant usage on schema private to service_role;
grant execute on function private.is_admin(uuid) to service_role;
alter table public.restaurant_venues add column handed_over_at timestamptz, add column handed_over_by uuid references auth.users(id);
update public.restaurant_venues v set handed_over_at=now(),agent_support=false where not agent_support and published and exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.active);
create or replace function private.restaurant_can_manage(p_venue uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_admin() or exists(
 select 1 from public.restaurant_venues v where v.id=p_venue and not v.suspended and (
 (v.owner_id=auth.uid() and v.agent_support and v.handed_over_at is null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))
 or exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.user_id=auth.uid() and a.active))));
$$;
create function private.restaurant_handover_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.handed_over_at is not null then raise exception 'Create the restaurant before handing it over'; end if;
  new.handed_over_by=null;
 end if;
 if TG_OP='UPDATE' then
  if old.handed_over_at is not null then
   if new.handed_over_at is distinct from old.handed_over_at or new.handed_over_by is distinct from old.handed_over_by then raise exception 'Handover is permanent'; end if;
   new.agent_support=false;
  elsif new.handed_over_at is not null then
   if not new.published or new.suspended or jsonb_array_length(new.menu)=0 or not exists(select 1 from public.restaurant_manager_access a where a.venue_id=new.id and a.active) then raise exception 'Publish a menu and create active manager access before handover'; end if;
   new.agent_support=false;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.restaurant_handover_guard() from public;
create trigger restaurant_handover_guard before insert or update on public.restaurant_venues for each row execute function private.restaurant_handover_guard();

create table public.restaurant_commission_settings (
 id boolean primary key default true check(id), amount numeric(12,2) not null default 0 check(amount>=0), currency text not null default 'INR' check(currency in ('INR','AED','GBP','USD','EUR')), updated_at timestamptz not null default now()
);
insert into public.restaurant_commission_settings(id) values(true);
alter table public.restaurant_commission_settings enable row level security;
create policy restaurant_rate_read on public.restaurant_commission_settings for select to authenticated using(private.is_admin() or exists(select 1 from public.profiles where id=auth.uid() and active and role='worker'));
create policy restaurant_rate_update on public.restaurant_commission_settings for update to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,update on public.restaurant_commission_settings to authenticated;
grant all on public.restaurant_commission_settings to service_role;
-- Historical commissions are snapshots. A rate change affects future handovers.
create or replace function private.restaurant_commission_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not private.is_admin() and not (TG_OP='INSERT' and current_user in ('postgres','service_role') and new.status='pending' and new.updated_by is null) then raise exception 'Only an administrator can change commissions'; end if;
 if not exists(select 1 from public.restaurant_venues v where v.id=new.venue_id and v.created_by=new.agent_id) then raise exception 'Commission belongs to the original setup agent'; end if;
 if new.status='paid' and (TG_OP='INSERT' or old.status not in ('approved','paid')) then raise exception 'Approve this setup before recording payment'; end if;
 if new.status in ('approved','paid') and not exists(select 1 from public.restaurant_venues v where v.id=new.venue_id and v.handed_over_at is not null and v.published and not v.suspended and jsonb_array_length(v.menu)>0 and exists(select 1 from public.restaurant_manager_access a where a.venue_id=v.id and a.active)) then raise exception 'Publish a menu, create active manager access and finish handover before approving commission'; end if;
 new.updated_by=auth.uid(); new.updated_at=now();
 if new.status='paid' then new.paid_at=coalesce(old.paid_at,now()); else new.paid_at=null; end if;
 return new;
end $$;
create function private.restaurant_onboarding_commission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.handed_over_at is not null and old.handed_over_at is null then
  insert into public.restaurant_commissions(venue_id,agent_id,amount,currency,status,note)
   select new.id,new.created_by,s.amount,s.currency,'pending','Successful restaurant onboarding · rate saved at handover' from public.restaurant_commission_settings s where s.id
   on conflict(venue_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.restaurant_onboarding_commission() from public;
create trigger restaurant_onboarding_commission after update on public.restaurant_venues for each row execute function private.restaurant_onboarding_commission();

create unique index restaurant_one_active_manager on public.restaurant_manager_access(venue_id) where active;
create function private.restaurant_can_request(p_venue uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.restaurant_can_manage(p_venue) or (auth.uid() is not null and exists(select 1 from public.restaurant_manager_access where venue_id=p_venue and user_id=auth.uid() and active));
$$;
revoke all on function private.restaurant_can_request(uuid) from public,anon;
grant execute on function private.restaurant_can_request(uuid) to authenticated,service_role;
create table public.restaurant_requests (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.restaurant_venues(id), created_by uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('ticket','addon','service')), subject text not null check(length(subject) between 1 and 160), message text not null check(length(message) between 1 and 4000), service_name text not null default '' check(length(service_name)<=160),
 status text not null default 'open' check(status in ('open','in_progress','quoted','completed','closed')),
 admin_reply text not null default '' check(length(admin_reply)<=4000), quote_amount numeric(12,2) check(quote_amount>=0), currency text not null default 'INR' check(currency in ('INR','AED','GBP','USD','EUR')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index restaurant_requests_venue on public.restaurant_requests(venue_id,created_at desc);
create index restaurant_requests_creator on public.restaurant_requests(created_by);
alter table public.restaurant_requests enable row level security;
create policy restaurant_request_read on public.restaurant_requests for select to authenticated using(private.restaurant_can_request(venue_id) or (created_by=auth.uid() and private.restaurant_can_read(venue_id)));
create policy restaurant_request_create on public.restaurant_requests for insert to authenticated with check(created_by=auth.uid() and private.restaurant_can_request(venue_id) and status='open' and admin_reply='' and quote_amount is null);
create policy restaurant_request_update on public.restaurant_requests for update to authenticated using(private.is_admin()) with check(private.is_admin());
create function private.restaurant_request_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.created_by=auth.uid();new.status='open';new.admin_reply='';new.quote_amount=null;
 else
  if not private.is_admin() then raise exception 'Only administrators can update requests'; end if;
  new.venue_id=old.venue_id;new.created_by=old.created_by;new.kind=old.kind;new.subject=old.subject;new.message=old.message;new.service_name=old.service_name;new.created_at=old.created_at;
 end if;
 new.updated_at=now();return new;
end $$;
revoke all on function private.restaurant_request_guard() from public;
create trigger restaurant_request_guard before insert or update on public.restaurant_requests for each row execute function private.restaurant_request_guard();
grant select,insert on public.restaurant_requests to authenticated;
grant update(status,admin_reply,quote_amount,currency) on public.restaurant_requests to authenticated;
grant all on public.restaurant_requests to service_role;
commit;
