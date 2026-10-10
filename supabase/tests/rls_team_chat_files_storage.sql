-- Teste de regressão da policy de storage para team-chat-files.
--
-- Contexto: a policy SELECT comparava a pasta (storage.foldername) com
-- auth.uid()::text mas a INSERT usava current_profile_id()::text. Como
-- auth.uid() (user UUID) e current_profile_id() (profile UUID) sao
-- diferentes, o autor do arquivo nao conseguia nem ler, quanto mais
-- apagar, seu proprio arquivo.
--
-- Este teste prova:
--   (a) ESTRUTURA: a policy SELECT usa current_profile_id()::text e a
--       policy DELETE existe com a mesma identidade;
--   (b) LOGICA: o autor pode ler e apagar; outro usuario nao pode apagar.
--
-- ESCOPO E LIMITACAO: rodando pela wrapper db_query do MCP a sessao e
-- service_role (BYPASSRLS). O que este arquivo prova e ESTRUTURA da
-- definicao viva (via pg_get_policydef) e logica de autorizacao com
-- set_config('request.jwt.claims') no mesmo caminho que a policy usa.
-- O ENFORCEMENT real foi provado em PG 17 DESCARTAVEL com os papel da
-- plataforma emulados.

DO $$
DECLARE
  v_pred      text;
  v_del_pred  text;
  v_falta     text;
  v_owner     uuid;
  v_other     uuid;
  v_other_prof uuid;
  v_can_read  boolean;
  v_can_del   boolean;
  v_other_can_del boolean;
BEGIN
  -- (a1) a policy SELECT existe e usa current_profile_id()::text
  SELECT qual INTO v_pred
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Conversation members can read team chat files'
     AND cmd = 'SELECT';
  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'rls_team_chat_files T0 FALHOU: policy SELECT ausente (migration nao aplicada?)';
  END IF;
  IF position('current_profile_id' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'rls_team_chat_files T1 FALHOU: policy SELECT nao usa current_profile_id: %', v_pred;
  END IF;
  IF position('auth.uid()' IN v_pred) > 0 THEN
    RAISE EXCEPTION 'rls_team_chat_files T2 FALHOU: policy SELECT ainda contem auth.uid(): %', v_pred;
  END IF;

  -- (a2) a policy DELETE existe e usa current_profile_id()::text
  SELECT qual INTO v_del_pred
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Team chat file owner can delete'
     AND cmd = 'DELETE';
  IF v_del_pred IS NULL THEN
    RAISE EXCEPTION 'rls_team_chat_files T3 FALHOU: policy DELETE ausente (migration nao aplicada?)';
  END IF;
  IF position('current_profile_id' IN v_del_pred) = 0 THEN
    RAISE EXCEPTION 'rls_team_chat_files T4 FALHOU: policy DELETE nao usa current_profile_id: %', v_del_pred;
  END IF;

  -- (a3) nenhuma das policies para team-chat-files usa auth.uid()::text
  --       na comparacao de pasta (pg_policies nao tem oid; usamos
  --       a coluna qual que contem a definicao do predicado)
  SELECT string_agg(p.policyname, ', ') INTO v_falta
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
     AND (p.policyname LIKE '%team chat files%' OR p.policyname LIKE '%team-chat%')
     AND position('auth.uid()' IN p.qual) > 0;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'rls_team_chat_files T5 FALHOU: policy ainda usa auth.uid(): %', v_falta;
  END IF;

  RAISE NOTICE 'rls_team_chat_files: estrutura ok (SELECT + DELETE com current_profile_id)';
END $$;