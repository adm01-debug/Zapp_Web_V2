-- Devolve o lado SUPERVISOR das tabelas da Fase 13 do Copiloto, sem reabrir RLS.
--
-- Causa: 20261107133000_fix_copilot_rls_open_policies.sql trocou o `USING (true)`
-- por "o autor da linha" (`seller_id/scored_by/tagged_by = auth.uid()`). Isso
-- fechou o vazamento entre vendedores, mas a Fase 13 é justamente a do supervisor
-- (ver os comentários da migration de criação 20261031100000: "pedidos de ajuda AO
-- supervisor", "pontuação de conversa PELO supervisor", "momentos de aprendizado
-- marcados PELO supervisor"). Resultado em produção hoje:
--
--   1. copilot_help_requests — o vendedor grava o pedido de ajuda e NINGUÉM mais
--      consegue ler: o SELECT exige seller_id = auth.uid(). O supervisor não vê a
--      fila de pedidos; o recurso não funciona.
--   2. copilot_conversation_scores — QUALQUER vendedor autenticado pontua QUALQUER
--      conversa (o CHECK só exige scored_by = auth.uid()), inclusive a própria.
--      Como conversation_id é a PRIMARY KEY e o UPDATE também exige
--      scored_by = auth.uid(), quem pontuar primeiro TRAVA a nota: o supervisor
--      não consegue inserir (PK ocupada) nem atualizar (não é o autor).
--   3. copilot_learning_moments — qualquer vendedor marca "exemplar" /
--      "anti_pattern" na conversa de qualquer colega.
--
-- Nenhuma das três tem linha em produção (consulta de 16/11: scores 0, moments 0,
-- help_requests 0), então a mudança não reclassifica nem apaga dado existente.
--
-- Papel de supervisor: public.is_admin_or_supervisor(uuid) (STABLE SECURITY
-- DEFINER, lê user_roles, já usada por 388 migrations deste repo). service_role
-- tem BYPASSRLS e não é afetado.
--
-- Rollback (volta ao estado de 20261107133000):
--   DROP POLICY IF EXISTS copilot_help_requests_select ON public.copilot_help_requests;
--   CREATE POLICY copilot_help_requests_select ON public.copilot_help_requests
--     FOR SELECT TO authenticated USING (seller_id = auth.uid());
--   DROP POLICY IF EXISTS copilot_conversation_scores_select ON public.copilot_conversation_scores;
--   CREATE POLICY copilot_conversation_scores_select ON public.copilot_conversation_scores
--     FOR SELECT TO authenticated USING (scored_by = auth.uid()
--       OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid()));
--   DROP POLICY IF EXISTS copilot_conversation_scores_insert ON public.copilot_conversation_scores;
--   CREATE POLICY copilot_conversation_scores_insert ON public.copilot_conversation_scores
--     FOR INSERT TO authenticated WITH CHECK (scored_by = auth.uid());
--   DROP POLICY IF EXISTS copilot_conversation_scores_update ON public.copilot_conversation_scores;
--   CREATE POLICY copilot_conversation_scores_update ON public.copilot_conversation_scores
--     FOR UPDATE TO authenticated USING (scored_by = auth.uid()) WITH CHECK (scored_by = auth.uid());
--   DROP POLICY IF EXISTS copilot_learning_moments_select ON public.copilot_learning_moments;
--   CREATE POLICY copilot_learning_moments_select ON public.copilot_learning_moments
--     FOR SELECT TO authenticated USING (tagged_by = auth.uid()
--       OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid()));
--   DROP POLICY IF EXISTS copilot_learning_moments_insert ON public.copilot_learning_moments;
--   CREATE POLICY copilot_learning_moments_insert ON public.copilot_learning_moments
--     FOR INSERT TO authenticated WITH CHECK (tagged_by = auth.uid());

-- 1. Pedido de ajuda: o vendedor vê os seus; admin/supervisor vê a fila inteira.
DROP POLICY IF EXISTS copilot_help_requests_select ON public.copilot_help_requests

CREATE POLICY copilot_help_requests_select ON public.copilot_help_requests
  FOR SELECT TO authenticated USING (
    seller_id = auth.uid()
    OR public.is_admin_or_supervisor(auth.uid())
  )

-- 2. Nota da conversa: só admin/supervisor pontua, e a linha registra quem foi.
--    O UPDATE permite a QUALQUER supervisor corrigir a nota (sem isso a PK
--    trava a conversa no primeiro que pontuou), sempre reescrevendo scored_by.
DROP POLICY IF EXISTS copilot_conversation_scores_select ON public.copilot_conversation_scores

CREATE POLICY copilot_conversation_scores_select ON public.copilot_conversation_scores
  FOR SELECT TO authenticated USING (
    scored_by = auth.uid()
    OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  )

DROP POLICY IF EXISTS copilot_conversation_scores_insert ON public.copilot_conversation_scores

CREATE POLICY copilot_conversation_scores_insert ON public.copilot_conversation_scores
  FOR INSERT TO authenticated WITH CHECK (
    scored_by = auth.uid() AND public.is_admin_or_supervisor(auth.uid())
  )

DROP POLICY IF EXISTS copilot_conversation_scores_update ON public.copilot_conversation_scores

CREATE POLICY copilot_conversation_scores_update ON public.copilot_conversation_scores
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (scored_by = auth.uid() AND public.is_admin_or_supervisor(auth.uid()))

-- 3. Momento de aprendizado: só admin/supervisor marca; o dono da conversa lê o
--    que foi marcado nela e o supervisor lê tudo.
DROP POLICY IF EXISTS copilot_learning_moments_select ON public.copilot_learning_moments

CREATE POLICY copilot_learning_moments_select ON public.copilot_learning_moments
  FOR SELECT TO authenticated USING (
    tagged_by = auth.uid()
    OR conversation_id IN (SELECT conversation_id FROM public.copilot_sessions WHERE profile_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  )

DROP POLICY IF EXISTS copilot_learning_moments_insert ON public.copilot_learning_moments

CREATE POLICY copilot_learning_moments_insert ON public.copilot_learning_moments
  FOR INSERT TO authenticated WITH CHECK (
    tagged_by = auth.uid() AND public.is_admin_or_supervisor(auth.uid())
  )
