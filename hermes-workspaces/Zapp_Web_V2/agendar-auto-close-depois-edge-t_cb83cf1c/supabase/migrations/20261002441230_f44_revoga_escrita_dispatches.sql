-- f44_revoga_escrita_dispatches
-- versão 20261002441230 reservada para hermes-bloco-e-api-dominio-dispatch-2610012241bab6 em 2026-10-02T08:09:56-03:00 (hermes-db-migrar --nova)
--
-- rollback: CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1));
-- rollback: CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()) AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)) WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1));
-- rollback: GRANT INSERT, UPDATE ON TABLE public.multiplix_dispatches TO authenticated;
--
-- F44 do Bloco E — API de dominio `multiplix-dispatch` (F44-F54) do
-- docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Objetivo do bloco: "o front nunca mais fala com as tabelas direto". Com a edge
-- `multiplix-dispatch` no ar (draft.create/get/update/discard, CORS + JWT + escopo do
-- JWT + correlation_id) e a RPC multiplix_create_draft (20260929630000, SECURITY
-- DEFINER, EXECUTE so para service_role) como unico caminho de escrita, o INSERT e o
-- UPDATE diretos do navegador em multiplix_dispatches deixam de existir.
--
-- O MOLDE e a segunda metade do F08:
-- supabase/migrations/20260929850000_multiplix_revoke_recipient_writes.sql revogou a
-- escrita direta em multiplix_recipients pela mesma razao. Aqui se faz o simetrico para
-- multiplix_dispatches: sem esta migration, o ganho de F44 e de fachada — um staff
-- autenticado continua chamando o PostgREST direto e insere/edita dispatches por fora da
-- edge, contornando a resolucao de audiencia e o escopo re-resolvidos no servidor.
--
-- O que sai:
--   * policy de INSERT  "Users can create dispatches" (FOR INSERT, TO authenticated);
--   * policy de UPDATE  "Users can update own dispatches" (FOR UPDATE, TO authenticated).
--     (Ambas recriadas em 20260929580000_multiplix_policies_consolidation.sql:44-64.)
--   * grants INSERT e UPDATE de authenticated na tabela (20260929570000 linha 35 concedeu
--     SELECT, INSERT, UPDATE, DELETE).
--
-- O que FICA:
--   * SELECT — "Admins can view all dispatches" e "Users can view own dispatches" (monitor);
--   * DELETE — "Users can delete own draft dispatches" (recriada em
--     20261001201230_f30_multiplix_enums_modelo_v2.sql, linha ~211), que continua exigindo
--     staff + dono + status 'draft' para limpar o rascunho antes do disparo.
--
-- ORDEM DE APLICACAO (importante): nao aplicar antes do deploy da edge `multiplix-dispatch`.
-- A partir do merge, o front cria/edita disparo pela edge; a edge so sobe por
-- workflow_dispatch do deploy-functions.yml + aprovacao no environment producao-edge-functions
-- (CLAUDE.md, secao 3). Se o REVOKE entrar antes do deploy, a criacao/edicao de disparo fica
-- indisponivel (a indisponibilidade e de escrita; o modulo tem 0 dispatches em producao, nao
-- ha perda de dado nem efeito em terceiros).
--
-- Por isso este arquivo e classificado como contrato pelo hermes-db-migrar (REVOKE/DROP
-- POLICY): fica registrado como pendente pos-merge e e aplicado depois do merge + deploy —
-- nunca na tarefa.

DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches;

REVOKE INSERT, UPDATE ON TABLE public.multiplix_dispatches FROM authenticated;

-- SELECT e DELETE seguem concedidos (e as policies correspondentes seguem valendo): a
-- leitura do monitor e a limpeza do rascunho pelo dono nao passam pela edge e nao foram
-- afetados por esta migration.
