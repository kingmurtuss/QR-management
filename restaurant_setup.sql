-- YAM Table: additive restaurant workspace. Existing QR records are untouched.
begin;
create table public.restaurant_venues (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$' and slug <> 'demo'),
 name text not null check (length(name) between 1 and 120),
 tagline text not null default 'Good food. Great company.',
 address text not null default '',
 logo_url text not null default '', cover_url text not null default '',
 accent text not null default '#a44b32' check(accent ~ '^#[0-9a-fA-F]{6}$'),
 currency text not null default 'INR' check(currency in ('INR','AED','GBP','USD','EUR')),
 google_url text not null default '', instagram_url text not null default '',
 wifi_ssid text not null default '', wifi_password text not null default '',
 wifi_enabled boolean not null default false, loyalty_enabled boolean not null default true,
 reward_name text not null default 'A coffee on the house',
 reward_target integer not null default 6 check(reward_target between 2 and 30),
 menu jsonb not null default '[]'::jsonb check(jsonb_typeof(menu)='array' and jsonb_array_length(menu)<=250),
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create index restaurant_venues_owner on public.restaurant_venues(owner_id);
create table public.restaurant_feedback (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.restaurant_venues(id),
 rating integer not null check(rating between 1 and 5),
 food integer check(food between 1 and 5), service integer check(service between 1 and 5),
 message text not null default '' check(length(message)<=2000),
 name text not null default '' check(length(name)<=100), resolved boolean not null default false,
 created_at timestamptz not null default now()
);
create index restaurant_feedback_venue on public.restaurant_feedback(venue_id,created_at desc);
create table public.restaurant_members (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.restaurant_venues(id),
 token_hash text not null unique check(length(token_hash)=64),
 name text not null check(length(name) between 1 and 100),
 stamps integer not null default 0 check(stamps>=0), redemptions integer not null default 0 check(redemptions>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index restaurant_members_venue on public.restaurant_members(venue_id);
create table public.restaurant_events (
 id bigint generated always as identity primary key,
 venue_id uuid not null references public.restaurant_venues(id),
 event text not null check(event in ('scan','menu','wifi','loyalty','review')),
 created_at timestamptz not null default now()
);
create index restaurant_events_venue on public.restaurant_events(venue_id,created_at desc);
alter table public.restaurant_venues enable row level security;
alter table public.restaurant_feedback enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.restaurant_events enable row level security;
-- Guests use the rate-limited Netlify endpoint; no anonymous table access.
create policy venue_read on public.restaurant_venues for select to authenticated
 using(owner_id=(select auth.uid()) or private.is_admin());
create policy venue_create on public.restaurant_venues for insert to authenticated
 with check((owner_id=(select auth.uid()) or private.is_admin()) and exists(select 1 from public.profiles where id=auth.uid() and active));
create policy venue_edit on public.restaurant_venues for update to authenticated
 using(owner_id=(select auth.uid()) or private.is_admin())
 with check(owner_id=(select auth.uid()) or private.is_admin());
create policy feedback_read on public.restaurant_feedback for select to authenticated
 using(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())));
create policy feedback_edit on public.restaurant_feedback for update to authenticated
 using(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())))
 with check(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())));
create policy member_read on public.restaurant_members for select to authenticated
 using(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())));
create policy member_edit on public.restaurant_members for update to authenticated
 using(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())))
 with check(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())));
create policy event_read on public.restaurant_events for select to authenticated
 using(exists(select 1 from public.restaurant_venues v where v.id=venue_id and (v.owner_id=(select auth.uid()) or private.is_admin())));
grant select,insert,update on public.restaurant_venues to authenticated;
grant select on public.restaurant_feedback,public.restaurant_members,public.restaurant_events to authenticated;
grant update(resolved) on public.restaurant_feedback to authenticated;
grant update(stamps,redemptions,updated_at) on public.restaurant_members to authenticated;
grant all on public.restaurant_venues,public.restaurant_feedback,public.restaurant_members,public.restaurant_events to service_role;
grant usage,select on sequence public.restaurant_events_id_seq to service_role;
-- Staff-only, RLS-enforced atomic stamp/redeem actions. No privileged execution.
create function public.restaurant_stamp(p_member uuid,p_action text)
returns public.restaurant_members language plpgsql security invoker set search_path='' as $$
declare m public.restaurant_members; goal integer;
begin
 select * into m from public.restaurant_members where id=p_member for update;
 if not found then raise exception 'Card not found or access denied'; end if;
 select reward_target into goal from public.restaurant_venues where id=m.venue_id;
 if p_action='stamp' then
   if m.stamps>=goal then raise exception 'Redeem the available reward first'; end if;
   update public.restaurant_members set stamps=stamps+1,updated_at=now() where id=p_member returning * into m;
 elsif p_action='redeem' then
   if m.stamps<goal then raise exception 'More stamps needed'; end if;
   update public.restaurant_members set stamps=stamps-goal,redemptions=redemptions+1,updated_at=now() where id=p_member returning * into m;
 else raise exception 'Invalid card action'; end if;
 return m;
end $$;
revoke all on function public.restaurant_stamp(uuid,text) from public,anon;
grant execute on function public.restaurant_stamp(uuid,text) to authenticated;
commit;
