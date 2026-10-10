-- Achado do Copilot na PR de reconstrucao retroativa de 20260902120000:
-- departments_select usa USING (true) para authenticated, mas a tabela tem
-- whatsapp_api_key em texto puro — qualquer usuario autenticado (nao so
-- admin/supervisor) podia ler a credencial da instancia WhatsApp do
-- departamento via supabase.from('departments').select('whatsapp_api_key').
--
-- RLS nao faz controle por coluna; a policy so decide QUAIS LINHAS, nao
-- QUAIS COLUNAS. O fix e privilegio de coluna (GRANT/REVOKE), nao mudar a
-- policy — departments_select continua liberando a lista de departamentos
-- para qualquer agente; so as 2 colunas de credencial ficam bloqueadas.
--
-- Pegadinha classica do Postgres: um REVOKE de coluna sozinho nao basta —
-- o GRANT SELECT de nivel de TABELA (default do schema public) cobre todas
-- as colunas independente de qualquer REVOKE por coluna. Precisa revogar
-- SELECT da tabela inteira e re-conceder so nas colunas seguras.
--
-- Zero codigo no front/edges referencia 'departments' ou 'whatsapp_api_key'
-- ainda (tabela nova, feature em rollout) — revogar agora nao quebra nada.
-- Funcao guardada abaixo, mesmo padrao de get_connection_qr_code (PR #125),
-- para a futura UI de admin ler a credencial sem reabrir o acesso direto.
REVOKE SELECT ON public.departments FROM authenticated, anon;

GRANT SELECT (id, name, is_active, whatsapp_mode, created_at, updated_at)
  ON public.departments
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_department_whatsapp_credentials(_department_id uuid)
RETURNS TABLE(whatsapp_api_key text, whatsapp_instance_id text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.whatsapp_api_key, d.whatsapp_instance_id
  FROM public.departments d
  WHERE d.id = _department_id
    AND public.is_admin_or_supervisor(auth.uid());
$function$;

-- Achado do cubic: funcao SECURITY DEFINER cria com EXECUTE aberto para
-- PUBLIC por padrao do Postgres (o predicado de role no WHERE ja barrava
-- anon/nao-admin na pratica, mas a ACL ficava permissiva demais). Mesmo
-- padrao de get_connection_qr_code (PR #125): revoga de PUBLIC/anon, deixa
-- so authenticated e service_role.
REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) TO authenticated, service_role;
