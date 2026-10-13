-- rls de contact_custom_fields x visibilidade de contato
--
-- Prova, so por leitura de catalogo, que as QUATRO policies de
-- public.contact_custom_fields (SELECT/INSERT/UPDATE/DELETE) usam o MESMO predicado
-- do resto do sistema — public.is_contact_visible_to_user(contact_id, auth.uid()) —
-- e nao o ramo antigo "contato atribuido OU admin/supervisor", que ignorava FILA e
-- carteira concedida. Roda como service_role (BYPASSRLS): aqui se prova a FORMA da
-- policy; a prova de EFETIVIDADE por papel real (authenticated/anon) e feita no banco
-- local descartavel, fora desta suite.
--
-- Regressao que este arquivo trava: 20261012215000_custom_fields_rls_visibility.sql
-- (antes dela a tela de contato via o contato por fila, mas os campos personalizados
-- nao — SELECT/INSERT/UPDATE/DELETE barravam por nao conhecer queue_members).

DO $$
DECLARE
  v_n      integer;
  v_qual   text;
  v_check  text;
  v_def    text;
BEGIN
  -- T1: RLS ligada na tabela
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.contact_custom_fields'::regclass) THEN
    RAISE EXCEPTION 'cf_rls T1 FALHOU: contact_custom_fields sem RLS ligada';
  END IF;

  -- T2: exatamente 4 policies (uma por comando) da 20261012215000
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'cf_rls T2 FALHOU: contact_custom_fields deveria ter 4 policies, tem %', v_n;
  END IF;

  -- T3: SELECT — authenticated, predicado via helper
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields' AND cmd = 'SELECT';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'cf_rls T3 FALHOU: sem policy SELECT em contact_custom_fields';
  END IF;
  IF v_qual NOT ILIKE '%is_contact_visible_to_user%' THEN
    RAISE EXCEPTION 'cf_rls T3 FALHOU: SELECT nao usa is_contact_visible_to_user (qual: %)', v_qual;
  END IF;
  IF v_qual ILIKE '%assigned_to%' THEN
    RAISE EXCEPTION 'cf_rls T3 FALHOU: SELECT ainda decide por assigned_to (deveria delegar ao helper): %', v_qual;
  END IF;

  -- T4: INSERT — WITH CHECK via helper
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields' AND cmd = 'INSERT';
  IF v_check IS NULL OR v_check NOT ILIKE '%is_contact_visible_to_user%' THEN
    RAISE EXCEPTION 'cf_rls T4 FALHOU: INSERT sem WITH CHECK usando is_contact_visible_to_user (check: %)', v_check;
  END IF;

  -- T5: UPDATE — USING e WITH CHECK via helper
  SELECT qual, with_check INTO v_qual, v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields' AND cmd = 'UPDATE';
  IF v_qual IS NULL OR v_qual NOT ILIKE '%is_contact_visible_to_user%'
     OR v_check IS NULL OR v_check NOT ILIKE '%is_contact_visible_to_user%' THEN
    RAISE EXCEPTION 'cf_rls T5 FALHOU: UPDATE sem helper em USING/WITH CHECK (using: %; check: %)', v_qual, v_check;
  END IF;

  -- T6: DELETE — USING via helper
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields' AND cmd = 'DELETE';
  IF v_qual IS NULL OR v_qual NOT ILIKE '%is_contact_visible_to_user%' THEN
    RAISE EXCEPTION 'cf_rls T6 FALHOU: DELETE sem helper no USING (qual: %)', v_qual;
  END IF;

  -- T7: todas as 4 policies so para o papel authenticated
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contact_custom_fields'
    AND roles <> ARRAY['authenticated']::name[];
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'cf_rls T7 FALHOU: % policy(ies) de contact_custom_fields fora do papel authenticated', v_n;
  END IF;

  -- T8: o helper mantem o ramo de FILA (queue_members) e e SECURITY DEFINER
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'is_contact_visible_to_user' AND pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'cf_rls T8 FALHOU: funcao is_contact_visible_to_user(uuid, uuid) ausente';
  END IF;
  IF v_def NOT ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'cf_rls T8 FALHOU: is_contact_visible_to_user perdeu SECURITY DEFINER';
  END IF;
  IF v_def NOT ILIKE '%queue_members%' THEN
    RAISE EXCEPTION 'cf_rls T8 FALHOU: is_contact_visible_to_user perdeu o ramo de fila (queue_members)';
  END IF;

  -- T9: unicidade (contact_id, field_name) preservada
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'contact_custom_fields'
      AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%(contact_id, field_name)%'
  ) THEN
    RAISE EXCEPTION 'cf_rls T9 FALHOU: indice unico (contact_id, field_name) ausente';
  END IF;

  RAISE NOTICE 'cf_rls: suite completa OK (T1-T9)';
END $$;
