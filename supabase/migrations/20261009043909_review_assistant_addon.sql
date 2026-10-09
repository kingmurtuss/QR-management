-- Additive, opt-in: no existing business or printed QR destination is changed.
create table public.business_review_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  default_language text not null default 'English' check (default_language in ('English','Hindi','Telugu')),
  updated_at timestamptz not null default now()
);
alter table public.business_review_settings enable row level security;
revoke all on public.business_review_settings from anon, authenticated;
grant select, insert, update on public.business_review_settings to authenticated;
grant all on public.business_review_settings to service_role;
create policy "Review settings visible to assigned active accounts"
on public.business_review_settings for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (
    select 1 from public.businesses b
    where b.id = business_id
      and (private.is_admin() or b.worker_id = (select auth.uid()))
  )
);
create policy "Admins create review settings"
on public.business_review_settings for insert to authenticated
with check (private.is_admin());
create policy "Admins update review settings"
on public.business_review_settings for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create table public.review_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  review_text text not null check (char_length(review_text) between 10 and 1500),
  rating smallint not null check (rating between 1 and 5),
  language text not null check (language in ('English','Hindi','Telugu')),
  drafts jsonb not null check (jsonb_typeof(drafts) = 'array' and jsonb_array_length(drafts) = 3),
  source text not null check (source in ('ai','basic')),
  created_at timestamptz not null default now()
);
create index review_reply_drafts_business_created_idx on public.review_reply_drafts(business_id, created_at desc);
create index review_reply_drafts_created_by_idx on public.review_reply_drafts(created_by);
alter table public.review_reply_drafts enable row level security;
revoke all on public.review_reply_drafts from anon, authenticated;
grant select, insert on public.review_reply_drafts to authenticated;
grant all on public.review_reply_drafts to service_role;
create policy "Assigned active accounts read reply drafts"
on public.review_reply_drafts for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (
    select 1 from public.businesses b
    where b.id = business_id
      and (private.is_admin() or b.worker_id = (select auth.uid()))
  )
);
create policy "Assigned active accounts save their own reply drafts"
on public.review_reply_drafts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (
    select 1 from public.businesses b
    where b.id = business_id
      and (private.is_admin() or b.worker_id = (select auth.uid()))
  )
);
