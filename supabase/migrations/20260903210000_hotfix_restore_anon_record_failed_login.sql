-- HOTFIX: revert 20260903200000 — anon grant on record_failed_login is REQUIRED
-- 20260903200000 revoked anon EXECUTE but was incorrect: record_failed_login is
-- called from src/lib/loginAttempts.ts (browser, pre-auth) via supabase.rpc(),
-- which runs as anon. Without this grant the lockout counter never increments
-- and no account can be locked — brute force fully open.
-- 20260903170000 had already documented and fixed this exact regression.
-- The correct long-term fix is to move the call to an Edge Function with IP
-- rate limiting, eliminating the need for anon access entirely.

GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO anon;
