-- =====================================================================
-- fix: recria canonicamente, e de forma INCONDICIONAL, as duas policies de
--      receipt do Team Chat (INSERT + SELECT) para convergencia do REPLAY.
-- =====================================================================
-- Este arquivo NAO contem nenhum `if not exists`: ele sempre DROP+CREATE as
-- duas policies. Em producao e no-op funcional; num replay limpo faz o
-- ambiente novo convergir para o canonico.
--
-- ---------------------------------------------------------------------
-- DEFEITO
-- ---------------------------------------------------------------------
-- As duas policies abaixo divergem entre o TEXTO DO ARQUIVO na main e o
-- EFEITO VIVO em producao:
--
--   Arquivo supabase/migrations/20260928430000_team_chat_fix_policies_to_authenticated.sql
--   cria a FORMA FRACA:
--     CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts
--       FOR SELECT TO authenticated USING (is_team_conversation_member(auth.uid(), conversation_id));
--     CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts
--       FOR INSERT TO authenticated WITH CHECK (profile_id = current_profile_id());
--
--   O EFEITO VIVO em producao (lido de pg_policies em 20/10/2026) e o CANONICO:
--     "Conversation members can read receipts" FOR SELECT TO authenticated
--       USING (is_admin_or_supervisor(auth.uid()) OR (EXISTS (
--         SELECT 1 FROM team_conversation_members mem
--           JOIN team_messages tm ON tm.id = team_message_receipts.message_id
--          WHERE mem.conversation_id = tm.conversation_id
--            AND mem.profile_id = current_profile_id())));
--     "Members can insert own receipts" FOR INSERT TO authenticated
--       WITH CHECK ((profile_id = current_profile_id()) AND (EXISTS (
--         SELECT 1 FROM team_conversation_members mem
--           JOIN team_messages tm ON tm.id = team_message_receipts.message_id
--          WHERE mem.conversation_id = tm.conversation_id
--            AND mem.profile_id = team_message_receipts.profile_id)));
--
-- ---------------------------------------------------------------------
-- PROVA: em producao ja esta canonico; o defeito e de REPRODUCAO
-- ---------------------------------------------------------------------
-- Em PRODUCAO NAO ha defeito: as policies vivas ja sao as canonicas.
-- O defeito aparece num REPLAY LIMPO das migrations:
--   1. 20260928430000 cria as duas policies na FORMA FRACA;
--   2. supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql
--      tem guarda `if not exists (select 1 from pg_policies where schemaname='public'
--      and tablename='team_message_receipts' and policyname=<nome> and roles='{authenticated}')`.
--      Como no passo 1 a policy FRACA ja existe, a guarda PULA e a forma canonica
--      nunca e aplicada.
--   Resultado no replay: INSERT de receipt SEM vinculo de conversa e SELECT
--   SEM o OR de admin/supervisor.
-- O CI deste repo roda o check "Replay local das migrations" (job replay-migrations,
-- .github/workflows/db-guard.yml), que executa scripts/db-audit/replay-local.sh.
--
-- ---------------------------------------------------------------------
-- EFEITO ESPERADO
-- ---------------------------------------------------------------------
-- PRODUCAO: no-op funcional. O USING/WITH CHECK declarados aqui sao identicos
--   aos que ja estao vivos; DROP+CREATE recria exatamente o mesmo estado.
-- REPLAY limpo: converge para o canonico. Este arquivo tem versao estritamente
--   maior que 20260928430000 e que 20261003272707, roda depois dos dois e, sem
--   nenhuma guarda `if not exists`, a ultima palavra sobre as duas policies e
--   sempre este arquivo.
--
-- ---------------------------------------------------------------------
-- FONTE DA EXPRESSAO CANONICA
-- ---------------------------------------------------------------------
-- supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql
-- (declara textualmente as expressoes canonicas). O texto de la confere com a
-- leitura viva de pg_policies em 20/10/2026, ignorando espacos e a qualificacao
-- de schema `public.`. Copiado exatamente de la.
--
-- ---------------------------------------------------------------------
-- ROLLBACK (recria as duas policies como estavam em 20260928430000)
-- ---------------------------------------------------------------------
--   DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;
--   CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts
--     FOR INSERT TO authenticated WITH CHECK (profile_id = current_profile_id());
--   DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;
--   CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts
--     FOR SELECT TO authenticated USING (is_team_conversation_member(auth.uid(), conversation_id));
-- =====================================================================

-- 1. INSERT: apenas o proprio profile, E o profile precisa ser membro da conversa da mensagem.
DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    (profile_id = public.current_profile_id())
    AND EXISTS (
      SELECT 1
        FROM public.team_conversation_members mem
        JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
       WHERE mem.conversation_id = tm.conversation_id
         AND mem.profile_id = team_message_receipts.profile_id
    )
  );

-- 2. SELECT: admin/supervisor, OU membro da conversa da mensagem.
DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;
CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.team_conversation_members mem
        JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
       WHERE mem.conversation_id = tm.conversation_id
         AND mem.profile_id = public.current_profile_id()
    )
  );