-- tc002_find_or_create_direct_pair_upsert
-- TC-002 (#55): a RPC ativa de conversa direta perdeu a proteção contra criação concorrente.
-- Rollback:
--   CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
--   RETURNS uuid
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
--   AS $rollback$
--   DECLARE
--     v_my_profile_id uuid;
--     v_conv_id uuid;
--   BEGIN
--     v_my_profile_id := public.current_profile_id();
--     IF v_my_profile_id IS NULL THEN
--       RAISE EXCEPTION 'not_authenticated';
--     END IF;
--     IF v_my_profile_id = other_profile_id THEN
--       RAISE EXCEPTION 'cannot_create_direct_with_self';
--     END IF;
--     SELECT c.id INTO v_conv_id
--       FROM public.team_conversations c
--       JOIN public.team_conversation_members m1
--         ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
--       JOIN public.team_conversation_members m2
--         ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
--      WHERE c.type = 'direct'
--      LIMIT 1;
--     IF v_conv_id IS NOT NULL THEN
--       RETURN v_conv_id;
--     END IF;
--     INSERT INTO public.team_conversations(type, created_by)
--     VALUES ('direct', v_my_profile_id)
--     RETURNING id INTO v_conv_id;
--     INSERT INTO public.team_conversation_members(conversation_id, profile_id)
--     VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id);
--     RETURN v_conv_id;
--   END;
--   $rollback$;
--
-- (o rollback devolve o corpo canônico anterior — o mesmo texto de 20260929190000 e da
--  reconciliação 20261003272707. A ACL não muda nesta migration: CREATE OR REPLACE preserva
--  dono e permissões, então não há REVOKE/GRANT para desfazer.)

-- Evidência (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md, TC-002):
-- a 20260929190000 recriou a função com "SELECT por membros + INSERT (type, created_by)", sem
-- gravar o par ordenado direct_member_a/b. Sem o par gravado, o índice único parcial
-- idx_team_conversations_direct_pair (WHERE type = 'direct') deixa de arbitrar duas inserções
-- simultâneas: duas requisições concorrentes para o MESMO par criam DUAS conversas diretas.
-- A 20260927270018 (E28) já tinha corrigido isso com o par + ON CONFLICT; a 20260929190000
-- desfez a correção e a reconciliação 20261003272707 repetiu o corpo regredido (é a definição
-- ativa hoje). O front chama esta RPC em src/hooks/team-chat/useTeamChatMutations.ts e logo
-- depois lê a conversa por id sob RLS — a duplicata quebra a tela.
--
-- O que esta migration faz:
--   1. volta a gravar a identidade canônica do par (direct_member_a/b ordenados);
--   2. troca o INSERT por UPSERT arbitrado pelo índice único do par
--      (ON CONFLICT (direct_member_a, direct_member_b) WHERE type = 'direct');
--   3. mantém a busca por MEMBROS para as linhas legadas gravadas sem par (criadas pelo corpo
--      regredido), para não criar uma conversa nova ao lado de uma que já existe;
--   4. mantém o INSERT de membros idempotente com ON CONFLICT (conversation_id, profile_id);
--   5. rejeita other_profile_id nulo (antes criaria uma linha com o par NULL).
-- Não altera dado, ACL, policy, papéis de membro nem constraint: nenhum acesso é retirado e nada é apagado.

CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_my_profile_id uuid;
  v_a uuid;
  v_b uuid;
  v_conv_id uuid;
BEGIN
  v_my_profile_id := public.current_profile_id();
  IF v_my_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF other_profile_id IS NULL THEN
    RAISE EXCEPTION 'other_profile_id_required';
  END IF;
  IF v_my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot_create_direct_with_self';
  END IF;

  -- Par ordenado canônico: é ele que o índice único parcial arbitra.
  IF v_my_profile_id::text < other_profile_id::text THEN
    v_a := v_my_profile_id;
    v_b := other_profile_id;
  ELSE
    v_a := other_profile_id;
    v_b := v_my_profile_id;
  END IF;

  -- 1) identidade canônica do par
  SELECT c.id INTO v_conv_id
    FROM public.team_conversations c
   WHERE c.type = 'direct'
     AND c.direct_member_a = v_a
     AND c.direct_member_b = v_b;

  -- 2) legado: linha direta criada sem o par gravado — acha pelos dois membros
  IF v_conv_id IS NULL THEN
    SELECT c.id INTO v_conv_id
      FROM public.team_conversations c
      JOIN public.team_conversation_members m1
        ON m1.conversation_id = c.id AND m1.profile_id = v_a
      JOIN public.team_conversation_members m2
        ON m2.conversation_id = c.id AND m2.profile_id = v_b
     WHERE c.type = 'direct'
     LIMIT 1;
  END IF;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 3) UPSERT arbitrado pelo índice único do par: requisições concorrentes para o mesmo par
  --    NÃO criam duas conversas (o DO NOTHING espera o commit da transação que ganhou a corrida).
  INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
  VALUES ('direct', v_my_profile_id, v_a, v_b)
  ON CONFLICT (direct_member_a, direct_member_b) WHERE type = 'direct' DO NOTHING
  RETURNING id INTO v_conv_id;

  -- 4) perdemos a corrida: a linha do par já está commitada — relê o par (não depende de
  --    visibilidade de membership) e, se por algum motivo ela não tiver os membros, garante.
  IF v_conv_id IS NULL THEN
    SELECT c.id INTO v_conv_id
      FROM public.team_conversations c
     WHERE c.type = 'direct'
       AND c.direct_member_a = v_a
       AND c.direct_member_b = v_b;
  END IF;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'direct_conversation_unavailable_for_pair';
  END IF;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id)
  VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN v_conv_id;
END;
$function$;

-- Fail-closed: sem o índice único do par o ON CONFLICT acima não tem árbitro e a migração não
-- cumpre o que promete (CREATE OR REPLACE sozinho não falharia).
DO $fail_closed$
BEGIN
  IF to_regclass('public.idx_team_conversations_direct_pair') IS NULL THEN
    RAISE EXCEPTION 'idx_team_conversations_direct_pair ausente: o UPSERT do par nao tem arbitro';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'idx_team_conversations_direct_pair'
       AND NOT i.indisunique
  ) THEN
    RAISE EXCEPTION 'idx_team_conversations_direct_pair nao e unico: o UPSERT do par nao arbitra';
  END IF;
END;
$fail_closed$;
