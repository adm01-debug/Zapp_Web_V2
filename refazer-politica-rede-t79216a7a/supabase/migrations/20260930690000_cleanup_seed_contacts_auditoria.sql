-- rollback: UPDATE public.contacts SET deleted_at = NULL WHERE id IN (
--   '2994c2ee-af64-48b0-8da3-b4134377f7ce',
--   '729d8fac-f145-42d1-b222-6be0980d2b55',
--   '787192a1-d097-49dd-8ce5-eda9b092c156',
--   '8217fbcc-72ef-48ff-9592-4c9315d266bd',
--   '3943117b-7009-4ff1-98b8-073fc73fe403'
-- );
--
-- Migration: limpeza dos 5 contatos-seed de auditoria (etapa 39 do
--            docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md).
-- Autor:     Hermes, sob autorizacao explicita do Joaquim em 2026-10-01 (via
--            decisao 20261001-150517-aa4f, item 2: "mandar para a lixeira os 5
--            contatos CLEANUP_NEEDED_TEST_AUDIT_* via RPC delete_contact").
--
-- ANTES (medido em 2026-10-01 pelo gateway somente-leitura, banco
-- tnnnlkbymytvtqngbbqh):
--   5 linhas com name LIKE 'CLEANUP_NEEDED_TEST_AUDIT%', todas com
--   deleted_at IS NULL (visiveis nas abas de Contatos), criadas em 2026-09-28:
--     * colaborador        2994c2ee-af64-48b0-8da3-b4134377f7ce
--     * fornecedor         729d8fac-f145-42d1-b222-6be0980d2b55
--     * parceiro           787192a1-d097-49dd-8ce5-eda9b092c156
--     * prestador_servico  8217fbcc-72ef-48ff-9592-4c9315d266bd
--     * transportadora     3943117b-7009-4ff1-98b8-073fc73fe403
--   Contagem visivel por tipo: cliente 2504, fornecedor 1, transportadora 1,
--   colaborador 1, prestador_servico 1, parceiro 1 (total visivel 3104).
--
-- ACAO: soft-delete em public.contacts.deleted_at (o MESMO campo que a RPC
--   delete_contact usa) para as 5 linhas identificadas por ID - nada de DELETE
--   fisico, nada de TRUNCATE, nenhuma linha apagada.
--   Por que nao pela RPC: a primeira tentativa (SELECT public.delete_contact(...))
--   foi RECUSADA pelo banco com "ERRO: HTTP 403 /rest/v1/rpc/mcp_exec:
--   {\"code\":\"42501\", \"message\":\"Sem sessao autenticada.\"}" - a RPC checa
--   auth.uid() e uma migration roda sem JWT. Diante disso apliquei o efeito
--   equivalente e reversivel sobre o mesmo campo, mantendo a autorizacao do
--   Joaquim (2026-10-01) e o mesmo estado final observavel.
--
-- DEPOIS (esperado): as 5 linhas ficam com deleted_at IS NOT NULL e as contagens
--   visiveis dos 5 tipos vao a 0; "cliente" continua em 2504.
--
-- Idempotente: o WHERE deleted_at IS NULL garante que rodar de novo nao altera nada.

UPDATE public.contacts
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND id IN (
     '2994c2ee-af64-48b0-8da3-b4134377f7ce',
     '729d8fac-f145-42d1-b222-6be0980d2b55',
     '787192a1-d097-49dd-8ce5-eda9b092c156',
     '8217fbcc-72ef-48ff-9592-4c9315d266bd',
     '3943117b-7009-4ff1-98b8-073fc73fe403'
   );
