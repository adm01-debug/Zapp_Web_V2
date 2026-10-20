-- HOTFIX: restaura grant anon em is_account_locked
-- A migration 20260904260000 revogou este grant sem a mudança de código
-- correspondente: checkAccountLock em src/lib/loginAttempts.ts ainda chama
-- supabase.rpc('is_account_locked') como anon (contexto pré-auth).
-- Sem este grant, a chamada recebe permission denied e retorna isLocked=false,
-- bypassando o lockout para usuários não autenticados.
-- TODO: mover checkAccountLock() para Edge Function (chamada server-side).
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon;

-- Revoke PUBLIC EXECUTE da trigger function SLA.
-- Adicionada em 20260903225000 já com grant público; o sweep de revoke
-- 20260903260000 não a cobriu pois listou funções pelo nome explicitamente.
-- Trigger functions não devem ser callable diretamente por clientes anônimos.
REVOKE EXECUTE ON FUNCTION public.messages_sla_first_response_trigger() FROM PUBLIC;
