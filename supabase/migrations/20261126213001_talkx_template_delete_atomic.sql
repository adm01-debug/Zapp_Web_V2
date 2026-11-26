-- talkx_template_delete_atomic
-- marcador: talkx_n127b_delete_template_atomic
-- Rollback: recria public.delete_talkx_template(uuid) com o corpo anterior ao N-127b (o mesmo que a migration N-127 deixou: confere dono/admin, EXISTS em campanha, DELETE — sem a trava FOR UPDATE). SQL executavel inline abaixo. A migration N-127b nao toca em GRANT/REVOKE, trigger, coluna nem dado: nada mais ha para desfazer.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.delete_talkx_template(p_template_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$ DECLARE v_caller uuid := auth.uid(); v_profile_id uuid; v_owner uuid; BEGIN IF v_caller IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; v_profile_id := public.get_profile_id_for_user(v_caller); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; SELECT created_by INTO v_owner FROM public.talkx_templates WHERE id = p_template_id; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'template_not_found'); END IF; IF NOT (v_owner = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; IF EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE template_id = p_template_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'talkx_template_in_use'); END IF; DELETE FROM public.talkx_templates WHERE id = p_template_id; RETURN jsonb_build_object('ok', true); END; $function$;
--
-- N-127b / Talk X: delete_talkx_template atomico (refazer 1 da recusa do N-127).
--
-- Problema: na delete_talkx_template a leitura do vinculo (EXISTS em
-- talkx_campaigns) e o DELETE aconteciam em comandos separados, sem trava na
-- linha do template. Uma campanha vinculada entre as duas leituras deixava a
-- exclusao passar, e a FK ON DELETE SET NULL orfava a campanha (template_id
-- NULL). O trigger trg_guard_talkx_template_delete barra o DELETE direto, mas
-- a RPC sozinha nao era atomica.
--
-- Correcao (so o corpo da RPC, mesma assinatura, mesma ACL, sem GRANT/REVOKE):
-- depois da checagem de dono/admin e antes do EXISTS, um SELECT ... FOR UPDATE
-- trava a linha do template ate o fim da transacao. A trava conflita com o
-- FOR KEY SHARE que o INSERT da campanha toma na linha do template (cheque da
-- FK), entao a campanha concorrente espera o fim desta transacao: se ela
-- commitar primeiro, o EXISTS abaixo (snapshot nova em READ COMMITTED) a
-- enxerga e a RPC devolve 'talkx_template_in_use'; se esta RPC commitar
-- primeiro, o INSERT concorrente falha na FK. Nos dois casos nunca ha template
-- apagado com campanha orfa. A trava fica DEPOIS da checagem de autorizacao de
-- proposito: quem nao e dono/admin recebe 'not_authorized' sem travar a linha
-- de ninguem. SELECT nao dispara trigger; nenhum gatilho e criado ou alterado.
--
-- Fora do escopo: duplicate/archive nao tem escrita rasgada (archive so grava
-- archived_at; duplicate copia variantes num SELECT unico apos o INSERT da
-- copia — sem cheque que invalide a escrita).

-- ============================================================================
-- delete_talkx_template — mesma RPC, com trava FOR UPDATE antes do EXISTS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_talkx_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT created_by INTO v_owner
  FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  IF NOT (v_owner = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- N-127b: trava a linha do template ate o fim da transacao antes de conferir
  -- o uso em campanha. Sem ela, EXISTS + DELETE em comandos separados deixam
  -- uma campanha vinculada no meio do caminho (TOCTOU) e a FK SET NULL a orfa.
  PERFORM 1 FROM public.talkx_templates WHERE id = p_template_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE template_id = p_template_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'talkx_template_in_use');
  END IF;

  DELETE FROM public.talkx_templates WHERE id = p_template_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;
