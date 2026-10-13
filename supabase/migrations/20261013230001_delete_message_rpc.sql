-- delete_message_rpc
-- Rollback: a RPC e as duas colunas de rastro saem; o is_deleted das linhas ja apagadas permanece (a exclusao em si nao e revertida).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.delete_message(uuid);
--   alter table public.messages drop column if exists deleted_by;
--   alter table public.messages drop column if exists deleted_at;
--
-- Paridade V3 -> V2 (cartao t_cfa99af7 / PE-20). Hoje a exclusao de mensagem e
-- feita pelos 4 pontos de UI com um UPDATE direto
-- `.update({ is_deleted: true, content: '[Mensagem apagada]' })`: o texto
-- original e SOBRESCRITO (nao ha como auditar o que foi apagado) e um agente
-- pode reescrever o conteudo de uma mensagem recebida do contato.
--
-- Esta migration cria `public.delete_message(p_message_id)` (SECURITY DEFINER,
-- search_path fixo, negada por padrao) que:
--   * marca is_deleted = true e registra quem (deleted_by) e quando (deleted_at);
--   * MANTEM `content` intacto — a tela mostra o rotulo '[Mensagem apagada]';
--   * so apaga se o chamador ve o contato (get_visible/queue/admin, o mesmo
--     predicado canonico is_contact_visible_to_user) E a mensagem e do proprio
--     agente (messages.agent_id = profile do chamador) ou ele e admin/supervisor;
--   * erro uniforme 'message_not_deletable' (42501) para inexistente, sem
--     visibilidade e sem posse — nao revela existencia de id (sem oraculo);
--   * e idempotente: chamar de novo numa linha ja apagada devolve false sem
--     tocar no original.
--
-- Colunas de rastro sao ADITIVAS e nullable (nenhum fluxo existente deixa de
-- funcionar). A guarda de `content` continua sendo do cartao ED1 (nao duplico o
-- gatilho aqui); esta RPC nao toca em `content`, `sender`, `agent_id` nem nos
-- campos internos, entao convive com os gatilhos de guarda ja existentes.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.messages.deleted_by IS
  'profiles.id de quem apagou a mensagem (rastro de auditoria; NULL = nao apagada).';
COMMENT ON COLUMN public.messages.deleted_at IS
  'instante da exclusao logica (rastro de auditoria; NULL = nao apagada).';

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_profile uuid;
  v_msg     public.messages%ROWTYPE;
  v_rows    integer;
BEGIN
  -- Autorizacao pela assinatura exata do chamador (dono da funcao ignora RLS).
  v_profile := public.get_profile_id_for_user(v_uid);
  IF v_uid IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Trava a linha ANTES de decidir: leitura e escrita no mesmo estado.
  SELECT * INTO v_msg
    FROM public.messages
   WHERE id = p_message_id
   FOR UPDATE;

  -- Erro uniforme: inexistente, fora de visibilidade e sem posse respondem
  -- IGUAL (nao revela se o id existe).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_deletable' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_contact_visible_to_user(v_msg.contact_id, v_uid) THEN
    RAISE EXCEPTION 'message_not_deletable' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(v_uid)
     AND v_msg.agent_id IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'message_not_deletable' USING ERRCODE = '42501';
  END IF;

  -- Idempotente: ja apagada nao muda nada nem falha.
  IF v_msg.is_deleted IS TRUE THEN
    RETURN false;
  END IF;

  -- Nao toca em `content`: o texto original fica preservado para auditoria.
  UPDATE public.messages
     SET is_deleted = true,
         deleted_by = v_profile,
         deleted_at = now()
   WHERE id = p_message_id
     AND coalesce(is_deleted, false) = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$function$;

-- Negar por padrao: assinatura exata, sem PUBLIC/anon.
REVOKE ALL ON FUNCTION public.delete_message(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_message(uuid)
  TO authenticated;
