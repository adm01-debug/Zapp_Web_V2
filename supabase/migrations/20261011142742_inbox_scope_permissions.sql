-- inbox_scope_permissions
-- Rollback: dropa a funcao de auditoria e remove as permissoes de escopo semeadas por esta migration.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.log_unauthorized_inbox_scope(text);
--   delete from public.role_permissions where permission_id in (select id from public.permissions where name in ('inbox.view_department', 'inbox.view_all'));
--   delete from public.permissions where name in ('inbox.view_department', 'inbox.view_all');
--
-- Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md)
-- e decisao do Joaquim em 11/10/2026. A V2 so libera "Mostrar todos" por permissao: existem
-- 'view_inbox'/'send_messages', mas NAO existe permissao de escopo (departamento/todos) nem trilha de
-- auditoria de tentativa indevida. Esta migration e ADITIVA: semeia duas permissoes novas na categoria
-- 'inbox', atribui a admin/supervisor e cria uma funcao de registro de tentativa fora do escopo.
-- Nenhuma tabela nova (RLS nao se aplica); nenhum DROP/RENAME/ALTER de objeto vivo; DML so nas tabelas
-- de catalogo de permissao, com ON CONFLICT (idempotente e reaplicavel).
--
-- 1. Catalogo: permissoes de escopo da inbox (categoria 'inbox', descricao em portugues).
--    'inbox.view_department' = ver as conversas do proprio departamento.
--    'inbox.view_all'        = ver as conversas de todos os departamentos.
INSERT INTO public.permissions (name, description, category) VALUES
  ('inbox.view_department', 'Inbox: ver as conversas do proprio departamento', 'inbox'),
  ('inbox.view_all',        'Inbox: ver as conversas de todos os departamentos', 'inbox')
ON CONFLICT (name) DO NOTHING;

-- 2. Atribuicao padrao: admin e supervisor ganham os dois escopos; agente comum fica so com "Meus".
--    (Ajustavel depois pela tela de permissoes.) Um unico INSERT ... SELECT evita N round-trips e o
--    ON CONFLICT (role, permission_id) respeita a PK de role_permissions (idempotente).
INSERT INTO public.role_permissions (role, permission_id)
SELECT matrix.role, permission.id
FROM (VALUES
  ('admin'::public.app_role),
  ('supervisor'::public.app_role)
) AS matrix(role)
JOIN public.permissions AS permission
  ON permission.name IN ('inbox.view_department', 'inbox.view_all')
ON CONFLICT (role, permission_id) DO NOTHING;

-- 3. Registro de tentativa indevida de escopo. SECURITY DEFINER para escrever na trilha mesmo com a
--    policy "Block direct audit log inserts" (WITH CHECK false TO authenticated).
--    - auth.uid() nulo (anon ou claim ausente) => nao grava nada.
--    - details carrega SOMENTE o escopo pedido (texto curto e sanitizado) — nada de telefone,
--      mensagem ou qualquer dado pessoal.
--    - dedupe_key por usuario+escopo+hora: uma linha por hora por usuario/escopo, sem inundar
--      (usa o indice unico parcial ux_audit_logs_dedupe_key e ON CONFLICT).
CREATE OR REPLACE FUNCTION public.log_unauthorized_inbox_scope(p_scope text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope text;
BEGIN
  -- Anonimo (ou sessao sem claim): nada e registrado.
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Escopo pedido, normalizado e limitado. Entrada invalida (nula/vazia/longa demais) nao quebra
  -- o chamador: vira 'unknown' e ainda assim fica auditada.
  v_scope := lower(btrim(coalesce(p_scope, '')));
  IF v_scope = '' OR length(v_scope) > 40 THEN
    v_scope := 'unknown';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, details, dedupe_key)
  VALUES (
    v_user_id,
    'unauthorized_inbox_scope_access',
    'inbox_scope',
    jsonb_build_object('scope', v_scope),
    'unauthorized_inbox_scope_access:'
      || v_user_id::text
      || ':' || v_scope
      || ':' || to_char(now() AT TIME ZONE 'utc', 'YYYYMMDDHH24')
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$function$;

-- ACL pela ASSINATURA EXATA: revoga do publico/anon/service_role e libera so para authenticated.
REVOKE ALL ON FUNCTION public.log_unauthorized_inbox_scope(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.log_unauthorized_inbox_scope(text) TO authenticated;

COMMENT ON FUNCTION public.log_unauthorized_inbox_scope(text) IS
  'Registra em audit_logs a tentativa de acessar um escopo de inbox sem permissao (action unauthorized_inbox_scope_access). Dedupe por usuario+escopo+hora via ux_audit_logs_dedupe_key. Sem dados pessoais; anonimo nao grava.';
