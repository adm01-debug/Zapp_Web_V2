-- L11 (docs/ia/IA-004-matriz-autorizacao.md:297): public.departments.whatsapp_api_key em
-- texto puro, "mitigado por GRANT de coluna". A mitigacao estava INCOMPLETA: o SELECT por
-- coluna foi feito em 20260902210000, mas o INSERT/UPDATE continuaram de nivel de TABELA
-- (privilegio default do schema public), e um REVOKE por coluna NAO remove grant de tabela
-- — a mesma pegadinha que o cabecalho da 20260902210000 ja documenta para o SELECT.
--
-- Medido ao vivo no banco canonico em 01/10/2026: authenticated tinha o grant de TABELA
-- INSERT/UPDATE/DELETE (relacl: authenticated=awdm/postgres, concedido por postgres — o
-- mesmo papel que aplica esta migration) e information_schema.column_privileges listava
-- whatsapp_api_key:INSERT/UPDATE e whatsapp_instance_id:INSERT/UPDATE. Conferindo attacl,
-- as 2 colunas de segredo NAO tem entrada propria de ACL: aquelas permissoes de coluna sao
-- DERIVADAS do grant de TABELA, que cobre todas as colunas. Efeito: qualquer usuario
-- autenticado podia GRAVAR o segredo da instancia WhatsApp do departamento direto pelo
-- PostgREST, sem passar pela RPC admin-only set_department_whatsapp_config. A leitura ja
-- estava fechada (SELECT por coluna da 20260902210000 + RPC de credencial so service_role).
--
-- Este arquivo fecha SO a parte de ACL do L11 (decisao do Joaquim: a migracao do valor para
-- o Vault e o drop da coluna ficam em PR proprio depois). O padrao e o mesmo ja usado no
-- SELECT: revogar o nivel de TABELA e reconceder apenas as colunas seguras.
--
-- Prova de que nao quebra a aplicacao (varredura em src/ e supabase/functions/ em 01/10/2026):
-- existe UMA unica referencia a departments por PostgREST, em
-- src/hooks/team-chat/useActiveDepartments.ts:16, e e um SELECT de colunas seguras; nao ha
-- nenhum INSERT/UPDATE/DELETE de departments no codigo do app. A escrita de credencial
-- continua pelo caminho previsto: public.set_department_whatsapp_config (SECURITY DEFINER,
-- com guard de admin/supervisor). RLS nao muda: departments_select continua liberando a
-- lista para qualquer agente e departments_admin_write segue valendo para quem tiver grant.
--
-- rollback: GRANT INSERT, UPDATE ON public.departments TO authenticated; GRANT INSERT (whatsapp_api_key, whatsapp_instance_id), UPDATE (whatsapp_api_key, whatsapp_instance_id) ON public.departments TO authenticated; REVOKE INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at), UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at) ON public.departments FROM authenticated;

-- 1) Tira do authenticated o INSERT/UPDATE de TABELA (que cobria TODAS as colunas,
--    inclusive as duas de credencial, independente de qualquer REVOKE por coluna).
REVOKE INSERT, UPDATE ON public.departments FROM authenticated;

-- 2) Cinto-e-suspensorio: repete a revogacao no nivel de COLUNA das duas colunas de segredo.
--    Por semantica do PostgreSQL 17, um REVOKE de tabela ja revoga por cascata os privilegios
--    de coluna do MESMO grantor, entao esta linha e redundante hoje — provado no contrato de
--    teste (l11-departments-acl-escrita.test.sh): removendo-a, o resultado nao muda. Fica
--    porque explicitar a intencao nao custa nada e cobre grant de coluna feito por outro
--    caminho. A linha que realmente fecha o furo e a do REVOKE de TABELA acima.
REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id),
       UPDATE (whatsapp_api_key, whatsapp_instance_id)
  ON public.departments FROM authenticated;

-- 3) Devolve a escrita apenas nas colunas seguras (mesmo conjunto concedido no SELECT de
--    20260902210000: id, name, is_active, whatsapp_mode, created_at, updated_at).
--    whatsapp_api_key e whatsapp_instance_id ficam sem INSERT e sem UPDATE para
--    authenticated: a unica via de escrita passa a ser set_department_whatsapp_config.
GRANT INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at)
  ON public.departments TO authenticated;

GRANT UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at)
  ON public.departments TO authenticated;
