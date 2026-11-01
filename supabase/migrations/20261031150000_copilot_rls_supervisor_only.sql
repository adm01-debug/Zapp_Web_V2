-- Segurança: restricao supervisor/admin em copilot_learning_moments (INSERT)
-- e copilot_conversation_scores (UPDATE).
--
-- Motivo: learning_moments e scores sao marcacoes de qualidade feitas pelo supervisor
-- sobre conversas do vendedor. Deixar qualquer vendedor inserir ou editar esses registros
-- abriria a porta para manipulacao das proprias avaliacoes.
--
-- Evidencia de callers: busca em src/ e supabase/functions/ em 2026-11-01 nao encontrou
-- nenhum chamador dessas duas operacoes -- tabelas criadas mas ainda sem uso no front-end
-- nem nas edge functions. Zero risco de quebrar fluxo existente.
--
-- O que muda:
--   copilot_learning_moments  INSERT: era aberto a todo authenticated; agora so supervisor/admin
--   copilot_conversation_scores UPDATE: era aberto a todo authenticated; agora so supervisor/admin
--
-- O que NAO muda (permissoes de vendedor preservadas):
--   copilot_outcomes           INSERT/SELECT  -- vendedor pode gravar e ler
--   copilot_objection_catalog  INSERT/SELECT  -- vendedor pode gravar e ler
--   copilot_usage              INSERT/SELECT  -- vendedor pode gravar e ler
--   copilot_seller_settings    INSERT/SELECT/UPDATE -- vendedor pode gravar, ler e editar proprias settings
--   copilot_help_requests      INSERT/SELECT  -- vendedor pode gravar e ler
--   copilot_learning_moments   SELECT         -- vendedor pode ler (so nao pode inserir)
--   copilot_conversation_scores INSERT/SELECT -- vendedor pode inserir e ler (so nao pode atualizar)

-- copilot_learning_moments: substitui INSERT aberto por INSERT supervisor/admin
DROP POLICY IF EXISTS "copilot_learning_moments_insert" ON public.copilot_learning_moments;
CREATE POLICY "copilot_learning_moments_insert"
  ON public.copilot_learning_moments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- copilot_conversation_scores: substitui UPDATE aberto por UPDATE supervisor/admin
DROP POLICY IF EXISTS "copilot_conversation_scores_update" ON public.copilot_conversation_scores;
CREATE POLICY "copilot_conversation_scores_update"
  ON public.copilot_conversation_scores FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- fim
