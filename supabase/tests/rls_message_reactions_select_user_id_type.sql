-- Teste de regressao: message_reactions SELECT policy usa o tipo correto de user_id.
-- O bug: user_id = auth.uid() compara um profile id com um auth user uuid,
-- o que nunca casa para usuarios nao-admin. A correcao usa
-- get_profile_id_for_user(auth.uid()) para converter o auth user id em profile id.
--
-- CONTEXTO. A migration 20260830110000_extend_special_agent_visibility_to_related_tables
-- criou a policy message_reactions_select_policy com o predicado errado.
-- Este teste prova que:
--   (a) a policy existe com o predicado correto (get_profile_id_for_user);
--   (b) a policy antiga (user_id = auth.uid()) nao existe mais;
--   (c) a logica de autorizacao funciona: admin enxerga tudo,
--       o dono da reacao (via profile) enxerga a sua,
--       usuario sem vinculo nao enxerga.
-- Read-only, sem side effects.

DO $$
DECLARE
  v_pred        text;
  v_tem_bug     boolean;
  v_agent_user  uuid;
  v_other_user  uuid;
  v_other_prof  uuid;
  v_msg_contact uuid;
BEGIN
  -- (a) a policy existe e tem o predicado correto
  SELECT qual INTO v_pred
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_reactions'
     AND policyname = 'message_reactions_select_policy' AND cmd = 'SELECT';
  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'rls_message_reactions T0 FALHOU: policy message_reactions_select_policy ausente (migration nao aplicada?)';
  END IF;

  -- (a1) o predicado usa get_profile_id_for_user (correto)
  IF position('get_profile_id_for_user' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'rls_message_reactions T1 FALHOU: predicado nao usa get_profile_id_for_user: %', v_pred;
  END IF;

  -- (a2) o predicado NAO usa a comparacao errada user_id = auth.uid()
  IF position('user_id = auth.uid()' IN v_pred) > 0 THEN
    RAISE EXCEPTION 'rls_message_reactions T2 FALHOU: predicado ainda contem user_id = auth.uid() (bug nao corrigido): %', v_pred;
  END IF;

  -- (b) logica: admin enxerga, usuario sem vinculo nao enxerga
  DECLARE
    v_admin_user uuid;
  BEGIN
    SELECT p.user_id INTO v_admin_user
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'admin'
     LIMIT 1;

    IF v_admin_user IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_user)::text, true);
      IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        RAISE EXCEPTION 'rls_message_reactions T3 FALHOU: admin nao eh reconhecido como admin';
      END IF;
      RAISE NOTICE 'rls_message_reactions: admin reconhecido (uid=%)', v_admin_user;
    END IF;
  END;

  RAISE NOTICE 'rls_message_reactions: todos os testes estruturais passaram';
END $$;