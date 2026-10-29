-- team_chat_direct_conversation_race_guard
-- Rollback:
-- CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_my_profile_id uuid;
--   v_conv_id uuid;
-- BEGIN
--   v_my_profile_id := public.current_profile_id();
--   IF v_my_profile_id IS NULL THEN
--     RAISE EXCEPTION 'not_authenticated';
--   END IF;
--   IF v_my_profile_id = other_profile_id THEN
--     RAISE EXCEPTION 'cannot_create_direct_with_self';
--   END IF;
--   SELECT c.id INTO v_conv_id
--   FROM public.team_conversations c
--   JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
--   JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
--   WHERE c.type = 'direct'
--   LIMIT 1;
--   IF v_conv_id IS NOT NULL THEN
--     RETURN v_conv_id;
--   END IF;
--   INSERT INTO public.team_conversations(type, created_by)
--   VALUES ('direct', v_my_profile_id)
--   RETURNING id INTO v_conv_id;
--   INSERT INTO public.team_conversation_members(conversation_id, profile_id)
--   VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id);
--   RETURN v_conv_id;
-- END;
-- $function$;
-- REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
-- Rollback-FIM
--
-- BACKLOG_VERIFICADO item 55 (P1 funcional, area migrations).
-- Problema: migrations posteriores recriaram public.find_or_create_direct_conversation(uuid)
-- sem gravar direct_member_a/direct_member_b e sem ON CONFLICT. O indice unico parcial
-- idx_team_conversations_direct_pair continuou existindo, mas ficou inerte porque as conversas
-- novas eram inseridas com o par NULL.
--
-- Delta desta migration (so o item 55):
--   1. exige fail-closed o indice unico parcial ja existente;
--   2. recria a RPC para calcular o par ordenado, inserir a conversa com direct_member_a/b e
--      usar ON CONFLICT sobre o indice unico parcial;
--   3. preserva o caminho legado por membros para conversas antigas ainda sem direct_member_a/b;
--   4. reafirma a ACL da assinatura exata.
--
-- A recusa da rodada 2 apontou que a versao anterior deixava uma tabela de apoio persistente
-- (team_conversations_direct_pair_backfill), gerando diferenca de schema no banco local. Esta
-- versao nao cria tabela, indice, policy, trigger nem constraint novos: so troca a RPC.
--
-- Sem BEGIN/COMMIT: a migration aplica numa unica transacao; qualquer erro desfaz tudo.

-- Sem BEGIN/COMMIT: a migration aplica numa unica transacao; qualquer erro desfaz tudo.

-- 1) Guarda fail-closed: sem o indice unico parcial nao existe garantia de banco ------------
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'team_conversations'
       AND idx.relname = 'idx_team_conversations_direct_pair'
       AND i.indisunique
       AND i.indpred IS NOT NULL
       AND pg_get_indexdef(i.indexrelid) LIKE '%(direct_member_a, direct_member_b)%'
       AND pg_get_indexdef(i.indexrelid) LIKE '%type = ''direct''%'
  ) THEN
    RAISE EXCEPTION 'find_or_create_direct_conversation exige o indice unico parcial idx_team_conversations_direct_pair (direct_member_a, direct_member_b) WHERE type = ''direct''; sem ele a protecao contra criacao concorrente nao tem garantia no banco';
  END IF;
END
$guard$;

-- 2) RPC com a protecao restaurada ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id uuid;
  v_conv_id uuid;
  v_a uuid;
  v_b uuid;
BEGIN
  v_my_profile_id := public.current_profile_id();
  IF v_my_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot_create_direct_with_self';
  END IF;

  -- Par ordenado: mesma regra do backfill historico E27 (MIN/MAX de profile_id::text).
  IF v_my_profile_id::text < other_profile_id::text THEN
    v_a := v_my_profile_id;
    v_b := other_profile_id;
  ELSE
    v_a := other_profile_id;
    v_b := v_my_profile_id;
  END IF;

  -- 1) Ja existe com o par gravado: caminho protegido pelo indice unico parcial.
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  WHERE c.type = 'direct'
    AND c.direct_member_a = v_a
    AND c.direct_member_b = v_b
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 2) Conversa legada: existe pelos membros, mas ficou sem o par gravado.
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
  JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 3) Criacao: a corrida e decidida pelo indice unico parcial, nao pelo SELECT acima.
  INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
  VALUES ('direct', v_my_profile_id, v_a, v_b)
  ON CONFLICT (direct_member_a, direct_member_b) WHERE type = 'direct' DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    -- Perdeu a corrida: quem venceu ja gravou a conversa; reler pelo par protegido.
    SELECT c.id INTO v_conv_id
    FROM public.team_conversations c
    WHERE c.type = 'direct'
      AND c.direct_member_a = v_a
      AND c.direct_member_b = v_b
    LIMIT 1;
    IF v_conv_id IS NULL THEN
      RAISE EXCEPTION 'direct_conversation_conflict_without_row';
    END IF;
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id)
  VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN v_conv_id;
END;
$function$;

-- 3) ACL pela assinatura exata (mesmo estado anterior; nenhum acesso novo) ------------------
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
