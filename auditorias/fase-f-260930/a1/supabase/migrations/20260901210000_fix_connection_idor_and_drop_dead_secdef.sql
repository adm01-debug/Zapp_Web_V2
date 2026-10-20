-- Fecha IDOR em get_connection_qr_code/get_connection_instance e remove 4
-- funcoes mortas reativaveis (auditoria 28/08/2026, achados M2/B1/B6).
--
-- M2 (IDOR): as duas funcoes sao SECURITY DEFINER, EXECUTE concedido a
-- 'authenticated', sem checagem de posse/role. A propria tabela
-- whatsapp_connections ja restringe SELECT a admin/supervisor via RLS
-- ("Admin supervisor view connections" = is_admin_or_supervisor(auth.uid())),
-- mas SECURITY DEFINER ignora RLS: qualquer agente logado podia chamar
-- supabase.rpc('get_connection_qr_code', {_connection_id}) e ler o QR code
-- de pareamento do WhatsApp (risco de sequestro de sessao) ou o instance_id,
-- sem passar pela policy. Zero chamadas no front hoje (grep confirma) -
-- fechado por defesa em profundidade, mesmo padrao de is_admin_or_supervisor
-- ja usado na policy da tabela.
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND public.is_admin_or_supervisor(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND public.is_admin_or_supervisor(auth.uid());
$function$;

-- B6: trigger anti-escalacao superada por audit_role_changes (migrations
-- 20260830010000/20260830030000) + guard direto em profiles/user_roles;
-- 0 triggers referenciam esta funcao hoje. Religa-la reabriria o bug A-01
-- (reversao silenciosa de escalacao de privilegio documentado em
-- docs/audits/VALIDACAO_EXAUSTIVA_2026-08-27.md).
DROP FUNCTION IF EXISTS public.prevent_role_escalation();

-- B6: stub de trigger ("credentials masking e feito via view segura"),
-- 0 triggers referenciam esta funcao hoje.
DROP FUNCTION IF EXISTS public.mask_channel_credentials();

-- B1: referencia a coluna inexistente password_reset_requests.reset_token
-- (42703 se chamada). Resto do subsistema de reset customizado (store/
-- validate_reset_token) ja foi dropado na migration 20260827170000;
-- supabase/functions/approve-password-reset/index.ts opera direto na
-- tabela, sem chamar esta RPC. Zero chamadas no front (grep confirma).
DROP FUNCTION IF EXISTS public.get_reset_requests_safe();

-- B1: mesma familia morta do subsistema de reset customizado dropado;
-- zero chamadas no front (grep confirma).
DROP FUNCTION IF EXISTS public.get_own_reset_requests();
