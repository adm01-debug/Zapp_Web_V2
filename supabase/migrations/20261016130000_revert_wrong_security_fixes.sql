-- Revert: desfaz 3 alteracoes erradas aplicadas na sessao de auditoria de 2026-10-16
-- As 3 "correcoes" contradiziam migrations ja existentes e corretas no repositorio.
--
-- Contexto: a sessao de auditoria de 16/10/2026 identificou 3 "gaps" que na verdade
-- eram designs intencionais das migrations originais. Este arquivo documenta a reversao
-- aplicada diretamente ao banco via db_query naquela sessao.
--
-- Rollback (restaura o estado errado — NAO executar):
--   CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials
--     FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
--   CREATE POLICY "Users can view own search events" ON public.search_events
--     FOR SELECT TO authenticated USING (user_id = auth.uid());
--   CREATE POLICY "Users can delete own search events" ON public.search_events
--     FOR DELETE TO authenticated USING (user_id = auth.uid());

-- REVERT 1: passkey_credentials INSERT policy
-- Motivo: 20261016005752_passkey_credentials_hardening remove intencionalmente.
-- INSERT direto por authenticated sem attestation = vulnerabilidade de seguranca P0.
-- O INSERT legitimo ocorre via Edge Function webauthn com service_role (BYPASSRLS).
DROP POLICY IF EXISTS "Users can insert own passkeys" ON public.passkey_credentials;

-- REVERT 2: search_events SELECT e DELETE policies
-- Motivo: 20261016013134_search_events so tem INSERT por design.
-- Leitura: apenas via RPC agregada (purge_old_search_events / analytics).
-- SELECT linha-a-linha nunca foi planejado para o cliente authenticated.
DROP POLICY IF EXISTS "Users can view own search events" ON public.search_events;
DROP POLICY IF EXISTS "Users can delete own search events" ON public.search_events;

-- REVERT 3: purge_gmail_account_data ACL
-- Motivo: 20261016033451 garante EXECUTE para authenticated com verificacao interna
-- de admin via is_admin(). service_role exclusivo quebraria o fluxo de admin JS.
-- A funcao verifica auth.uid() internamente — authenticated + is_admin() e correto.
REVOKE ALL ON FUNCTION public.purge_gmail_account_data(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_gmail_account_data(uuid, text)
  TO authenticated;
