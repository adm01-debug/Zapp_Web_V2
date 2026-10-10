-- team_reaction_membership_guard
-- versão 20260930260000 reservada para hermes-team-reaction-vinculo-26093014025470 em 2026-09-30T14:04:01-03:00 (hermes-db-migrar --nova)
--
-- rollback: so use se a correcao bloquear algum caminho legitimo nao previsto (volta o comportamento vigente antes de 30/09, incluindo o furo cross-team):
-- rollback: create policy reactions_insert on public.team_message_reactions for insert to authenticated with check (profile_id = current_profile_id());
-- rollback: create or replace function public.toggle_team_reaction(p_message_id uuid, p_emoji text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_exists boolean; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; SELECT EXISTS(SELECT 1 FROM public.team_message_reactions WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji) INTO v_exists; IF v_exists THEN DELETE FROM public.team_message_reactions WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji; RETURN jsonb_build_object('action','removed','emoji',p_emoji); ELSE INSERT INTO public.team_message_reactions(message_id, profile_id, emoji) VALUES (p_message_id, v_profile_id, p_emoji) ON CONFLICT DO NOTHING; RETURN jsonb_build_object('action','added','emoji',p_emoji); END IF; END; $f$;
--
-- #1265 (ALTO, demonstrado): reação cross-team em `team_message_reactions`. Duas causas independentes:
--
--   1. DUPLICIDADE DE POLICY. `team_message_reactions` tem duas policies de INSERT PERMISSIVE para
--      `authenticated`; como PERMISSIVE soma por OR, basta UMA passar:
--        * `reactions_insert`            -> WITH CHECK (profile_id = current_profile_id())          -- SEM vínculo
--        * `team_message_reactions_insert` -> WITH CHECK (profile_id = current_profile_id()) AND
--                                            EXISTS (... is_team_conversation_member(auth.uid(), tm.conversation_id))
--      O caminho do app é justamente o INSERT DIRETO via PostgREST (`useTeamMessageReactions.ts`
--      insere em `team_message_reactions`, sem RPC), então a policy fraca era o buraco em uso.
--      A estrita é superconjunto estrito da fraca (mesmo `profile_id`, + o vínculo), então removê-la
--      não tira nenhum caminho legítimo.
--
--   2. A RPC `toggle_team_reaction` é SECURITY DEFINER (não passa por RLS) e não checava vínculo —
--      um `authenticated` de outro time reagia a mensagem alheia se a chamasse.
--
-- Registros afetados: `team_message_receipts` NÃO entra — a única policy de INSERT dela
-- ("Members can insert own receipts") já exige o vínculo (conferido no canônico em 30/09).
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação.

DROP POLICY IF EXISTS reactions_insert ON public.team_message_reactions;

CREATE OR REPLACE FUNCTION public.toggle_team_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_exists     boolean;
  v_conversation_id uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- #1265: a função é SECURITY DEFINER, então a RLS não a protege — o vínculo é checado aqui.
  -- A conversa sai da PRÓPRIA mensagem (não de parâmetro), então não há como mentir sobre o time.
  SELECT tm.conversation_id INTO v_conversation_id
    FROM public.team_messages tm
    JOIN public.team_conversation_members tcm
      ON tcm.conversation_id = tm.conversation_id
   WHERE tm.id = p_message_id
     AND tcm.profile_id = v_profile_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.team_message_reactions
     WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.team_message_reactions
     WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji;
    RETURN jsonb_build_object('action', 'removed', 'emoji', p_emoji);
  ELSE
    -- `conversation_id` é NOT NULL e sem default, e `team_message_reactions` (ao contrário de
    -- `team_message_receipts`) não tem trigger que o preencha: sem esta coluna o caminho 'added'
    -- da RPC sempre estourava (null value in column "conversation_id"). Vai o da mensagem.
    INSERT INTO public.team_message_reactions(message_id, profile_id, emoji, conversation_id)
    VALUES (p_message_id, v_profile_id, p_emoji, v_conversation_id)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('action', 'added', 'emoji', p_emoji);
  END IF;
END;
$function$;
