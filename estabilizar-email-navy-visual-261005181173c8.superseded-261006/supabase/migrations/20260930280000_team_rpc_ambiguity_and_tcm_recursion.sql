-- team_rpc_ambiguity_and_tcm_recursion
-- versão 20260930280000 reservada para hermes-team-chat-rpc-ambigua-recursao-2609301429610d em 2026-09-30T14:29:37-03:00 (hermes-db-migrar --nova)
--
-- rollback: volta as duas coisas ao estado de antes (o defeito): a policy recursiva e a funcao com as referencias ambiguas.
-- rollback: drop policy if exists tcm_select_own on public.team_conversation_members;
-- rollback: create policy tcm_select_own on public.team_conversation_members for select to authenticated using ((profile_id = public.current_profile_id()) OR (EXISTS ( SELECT 1 FROM public.team_conversation_members m2 WHERE ((m2.conversation_id = team_conversation_members.conversation_id) AND (m2.profile_id = public.current_profile_id())))));
-- rollback: create or replace function public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50) returns table(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text) language plpgsql security definer set search_path to 'public' as $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_before_at timestamptz; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id) THEN RAISE EXCEPTION 'not_member'; END IF; IF p_before_id IS NOT NULL THEN SELECT created_at INTO v_before_at FROM public.team_messages WHERE id = p_before_id; END IF; RETURN QUERY SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path, m.is_edited, m.created_at, m.updated_at, p.name, p.avatar_url FROM public.team_messages m LEFT JOIN public.profiles p ON p.id = m.sender_id WHERE m.conversation_id = p_conversation_id AND (v_before_at IS NULL OR m.created_at < v_before_at) ORDER BY m.created_at DESC LIMIT LEAST(p_limit, 200); END; $f$;
--
-- #1266 — dois defeitos medidos no canônico (`tnnnlkbymytvtqngbbqh`) em 30/09. Ambos são LATENTES hoje
-- (nenhum chamador em `src/` — o app do team chat ainda não usa esses objetos), mas o DDL já está
-- concedido a `authenticated`, então é objeto quebrado em produção esperando o primeiro cliente.
--
--   1) `get_team_messages_page` — TRÊS referências AMBÍGUAS (42702).
--      A função declara `RETURNS TABLE(id uuid, conversation_id uuid, ..., created_at timestamptz, ...)`.
--      Em PL/pgSQL os nomes das colunas de saída viram VARIÁVEIS, e `plpgsql.variable_conflict` é
--      `error` por padrão. Logo, sem alias, estes pontos são ambíguos (variável vs coluna):
--        * `WHERE conversation_id = p_conversation_id` (checagem de vínculo) → quebra TODA chamada;
--        * `SELECT created_at ... WHERE id = p_before_id` (cursor)              → quebra toda paginação.
--      Provado em Postgres 17 descartável (mesma forma da função):
--        ERROR:  column reference "conversation_id" is ambiguous
--        DETAIL:  It could refer to either a PL/pgSQL variable or a table column.
--        CONTEXT: PL/pgSQL function f(uuid,uuid) line 3 at IF
--      e o controle (versão qualificada) passa da mesma linha. Correção: **só qualificar** (aliases
--      `tcm` e `tm`). Assinatura, colunas, ordem, default e `LIMIT LEAST(p_limit, 200)` ficam idênticos —
--      o contrato não muda; mudanças de contrato (cursor por created_at, reações, status) são do plano
--      do team chat, não deste fix.
--
--   2) `tcm_select_own` (policy de SELECT de `team_conversation_members`) — RECURSÃO INFINITA.
--      O `qual` faz `EXISTS (SELECT 1 FROM public.team_conversation_members m2 ...)`, isto é, referencia
--      a PRÓPRIA tabela cuja policy está sendo avaliada → PostgreSQL aborta com
--      "infinite recursion detected in policy for relation team_conversation_members" (42P17) em
--      qualquer SELECT de `authenticated`. Correção: usar o helper SECURITY DEFINER
--      `public.is_team_conversation_member(auth.uid(), conversation_id)` — o dono é `postgres` e a
--      tabela tem `relforcerowsecurity = false`, então a RLS não se aplica dentro do helper e a
--      recursão não acontece. A semântica é preservada: o `qual` antigo (o meu perfil **ou** uma linha
--      minha na mesma conversa) equivale a "sou membro desta conversa", que é exatamente o helper —
--      se eu tenho linha na conversa, sou membro dela, então o helper cobre o primeiro disjunto.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação.

CREATE OR REPLACE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_before_at  timestamptz;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- #1266: alias `tcm` — sem ele, `conversation_id` colide com a coluna de saída homônima (42702).
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  IF p_before_id IS NOT NULL THEN
    -- #1266: alias `tm` — `created_at` e `id` também são colunas de saída (42702).
    SELECT tm.created_at INTO v_before_at
      FROM public.team_messages tm WHERE tm.id = p_before_id;
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
    m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path,
    m.is_edited, m.created_at, m.updated_at,
    p.name, p.avatar_url
  FROM public.team_messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (v_before_at IS NULL OR m.created_at < v_before_at)
  ORDER BY m.created_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$function$;

-- #1266: a policy recursiva sai; entra a mesma regra via helper SECURITY DEFINER.
DROP POLICY IF EXISTS tcm_select_own ON public.team_conversation_members;

CREATE POLICY tcm_select_own ON public.team_conversation_members
  FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), team_conversation_members.conversation_id));
