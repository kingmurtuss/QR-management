-- Agent restaurant creation: allow INSERT ... RETURNING to read its new row.
--
-- The venue_create INSERT policy is already owner- and active-account-scoped.
-- But venue_read previously depended solely on private.restaurant_can_read(id),
-- a STABLE helper that re-queries restaurant_venues. During a single INSERT
-- ... RETURNING statement this inner query may not see the newly inserted row.
-- PostgREST then rejects the response with SQLSTATE 42501, even though the
-- agent owns the new row.
--
-- Keep existing admin/manager and pre/post-handover read behavior; add a
-- row-local condition for the original creator. Creation remains restricted by
-- venue_create, and editing continues to be governed by venue_edit.
alter policy venue_read on public.restaurant_venues
  using (
    private.restaurant_can_read(id)
    or (
      created_by = (select auth.uid())
      and exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.active = true
      )
    )
  );
