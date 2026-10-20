-- A migration 20260910080000 was already recorded remotely with the permissive
-- policy body. Keep that historical file byte-for-byte compatible with the
-- ledger and tighten access in this forward-only migration.
--
-- The policy is a verified legacy precondition. The historical migration
-- 20260910080000 registered in the ledger added audit columns only. Failing
-- when this policy is absent is intentional: silently creating one here could
-- choose the wrong command/owner and leave a privilege gap unnoticed.
ALTER POLICY talkx_blacklist_update
  ON public.talkx_blacklist
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
