import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration enforces admin settings, worker ownership, active accounts and anonymous denial', async () => {
  const db = new PGlite();
  const worker = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  const admin = '00000000-0000-0000-0000-000000000003';
  const disabled = '00000000-0000-0000-0000-000000000004';
  const b1 = '10000000-0000-0000-0000-000000000001';
  const b2 = '10000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key, role text, active boolean);
      create table public.businesses(id uuid primary key, worker_id uuid references public.profiles(id));
      create function private.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce((select role='admin' and active from public.profiles where id=auth.uid()),false) $$;
      grant usage on schema auth,private,public to anon,authenticated,service_role;
      grant select on public.profiles,public.businesses to authenticated;
      alter table public.profiles enable row level security;
      create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
      alter table public.businesses enable row level security;
      create policy business_read on public.businesses for select to authenticated using(worker_id=auth.uid() or private.is_admin());
      insert into public.profiles values ('${worker}','worker',true),('${other}','worker',true),('${admin}','admin',true),('${disabled}','worker',false);
      insert into public.businesses values ('${b1}','${worker}'),('${b2}','${other}');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261009043909_review_assistant_addon.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.business_review_settings(business_id) values('${b1}'),('${b2}');`);
    const as = async id => { await db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`); };
    const count = async table => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
    await as(admin); assert.equal(await count('business_review_settings'),2);
    await db.exec(`update public.business_review_settings set enabled=true where business_id='${b1}';`);
    await as(worker); assert.equal(await count('business_review_settings'),1);
    const blockedUpdate = await db.query(`update public.business_review_settings set enabled=false where business_id='${b1}' returning business_id;`); assert.equal(blockedUpdate.rows.length,0);
    const insert = (businessId, creator) => `insert into public.review_reply_drafts(business_id,created_by,review_text,rating,language,drafts,source) values('${businessId}','${creator}','The food was cold.',1,'English','["a","b","c"]','basic');`;
    await db.exec(insert(b1,worker)); assert.equal(await count('review_reply_drafts'),1);
    await assert.rejects(db.exec(insert(b2,worker)),/row-level security/);
    await assert.rejects(db.exec(insert(b1,other)),/row-level security/);
    await as(other); assert.equal(await count('review_reply_drafts'),0);
    // Even if another business SELECT policy becomes broad, the add-on's own
    // explicit ownership checks must still isolate settings and reply drafts.
    await db.exec('reset role; create policy test_broad_business_read on public.businesses for select to authenticated using(true);');
    await as(worker); assert.equal(await count('businesses'),2); assert.equal(await count('business_review_settings'),1); assert.equal(await count('review_reply_drafts'),1);
    await assert.rejects(db.exec(insert(b2,worker)),/row-level security/);
    await as(other); assert.equal(await count('businesses'),2); assert.equal(await count('business_review_settings'),1); assert.equal(await count('review_reply_drafts'),0);
    await as(disabled); assert.equal(await count('business_review_settings'),0); assert.equal(await count('review_reply_drafts'),0);
    await assert.rejects(db.exec(insert(b1,disabled)),/row-level security/);
    await as(admin); assert.equal(await count('review_reply_drafts'),1);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.business_review_settings;'),/permission denied/);
    await assert.rejects(db.query('select * from public.review_reply_drafts;'),/permission denied/);
  } finally { await db.close(); }
});
