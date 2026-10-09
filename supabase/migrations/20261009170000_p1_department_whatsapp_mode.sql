-- p1_department_whatsapp_mode
-- Rollback: DROP FUNCTION IF EXISTS public.get_department_whatsapp_mode(uuid);

-- QA5-09: a tela de WhatsApp do departamento so precisa do MODO salvo
-- ('none' | 'evolution' | 'official'), mas chamava a RPC de credenciais, que e
-- service_role-only (REVOKE de PUBLIC, anon, authenticated em 20260928550000) e
-- devolve a chave da API. RPC NOVA, aditiva: devolve texto puro — o tipo de
-- retorno nao tem campo de chave (prova estrutural de que o segredo nao sai).
-- Portao de papel identico ao do irmao set_department_whatsapp_config
-- (20260928540000): sem profile -> not_authenticated; fora de
-- admin/supervisor -> not_authorized. Os dois saem com SQLSTATE 42501, o mesmo
-- codigo que anon recebe por nao ter EXECUTE — contrato uniforme para o cliente.

CREATE OR REPLACE FUNCTION public.get_department_whatsapp_mode(p_department_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_profile_id uuid;
  v_is_admin boolean;
  v_mode text;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT (role IN ('admin','supervisor')) INTO v_is_admin
    FROM public.profiles WHERE id = v_profile_id;
  -- Deny-by-default: um profile ausente deixaria v_is_admin NULL e `NOT NULL` nao
  -- dispara o IF (fail-open). `IS NOT TRUE` fecha os dois casos.
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT whatsapp_mode INTO v_mode FROM public.departments WHERE id = p_department_id;
  RETURN v_mode;
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_mode(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_mode(uuid) TO authenticated;
