-- team_chat_direct_conversation_race_guard
-- Rollback: 1) recriar public.find_or_create_direct_conversation(uuid) com o corpo ANTERIOR transcrito no bloco R1 abaixo (o texto de cada linha esta depois do prefixo '-- '); 2) UPDATE public.team_conversations SET direct_member_a = NULL, direct_member_b = NULL WHERE id IN (SELECT conversation_id FROM public.team_conversations_direct_pair_backfill); 3) DROP TABLE IF EXISTS public.team_conversations_direct_pair_backfill;
--
-- BACKLOG_VERIFICADO item 55 (P1 funcional, area migrations). Historico medido nos arquivos:
--   20260927270007 (E16) criou o indice unico parcial idx_team_conversations_direct_pair
--     (direct_member_a, direct_member_b) WHERE type = 'direct' e a 1a versao da RPC;
--   20260927270017 (E27) fez o backfill do par ordenado (MIN/MAX de profile_id::text);
--   20260927270018 (E28) corrigiu a corrida com ON CONFLICT DO NOTHING sobre esse indice;
--   20260929190000 (E29, recuperada do ledger) e 20261003272707 (reconciliacao com o canonico)
--     recriaram a RPC SEM gravar direct_member_a/b e SEM ON CONFLICT: a corrida voltou a ser
--     decidida por consulta-antes-de-inserir. O indice continua no banco
--     (supabase/schema-manifest.json: team_conversations.idx_team_conversations_direct_pair).
--
-- Delta desta migration (so o item 55):
--   1. tabela de apoio public.team_conversations_direct_pair_backfill: registra as conversas
--      diretas legadas que o backfill cobriu (e a lista exata do passo 2 do Rollback);
--   2. backfill do par ordenado nas conversas diretas de 2 membros que ficaram SEM o par
--      (mesma regra do E27), UM par por conversa: se a corrida ja produziu duas conversas para
--      o mesmo par, a mais antiga recebe o par e a outra fica como esta (nada e apagado nem
--      reescrito aqui);
--   3. guarda fail-closed: a migration RECUSA aplicar se o indice unico parcial nao existir
--      (sem ele a "protecao" voltaria a ser consulta-antes-de-inserir);
--   4. RPC recriada: grava o par ordenado e cria com ON CONFLICT DO NOTHING sobre o indice,
--      relendo o id de quem venceu a corrida (padrao do E28); mantem o caminho da conversa
--      legada por MEMBROS e as guardas not_authenticated / cannot_create_direct_with_self;
--   5. ACL reafirmada pela assinatura exata, igual ao estado das migrations 20260927530000 e
--      20260929190000 (sem EXECUTE para PUBLIC/anon; com EXECUTE para authenticated e service_role).
--
-- Efeitos colaterais (listados): o trigger canonico update_team_conversations_updated_at e
-- BEFORE UPDATE e reescreve updated_at em qualquer UPDATE, entao o backfill avanca o updated_at
-- das conversas cobertas. O Rollback NAO restaura esse instante: o trigger o reescreveria de
-- novo. Nenhum outro trigger, publication de realtime ou job de pg_cron e tocado.
-- Divergencia conhecida: other_profile_id inexistente passa a estourar a FK de direct_member_a/b
-- no INSERT da conversa (antes estourava a FK de team_conversation_members). Mesma classe de
-- erro (foreign key) e mesma atomicidade.
--
-- R1) corpo ANTERIOR da RPC, transcrito de 20261003272707 (reconciliacao com o canonico):
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
-- R1-FIM
--
-- Sem BEGIN/COMMIT: a migration aplica numa unica transacao; qualquer erro desfaz tudo.

-- 1) Tabela de apoio: o que o backfill mexeu (fonte exata do passo 2 do Rollback) -----------
CREATE TABLE IF NOT EXISTS public.team_conversations_direct_pair_backfill (
  conversation_id uuid PRIMARY KEY REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  direct_member_a  uuid NOT NULL,
  direct_member_b  uuid NOT NULL,
  backfilled_at    timestamptz NOT NULL DEFAULT now()
);

-- Objeto interno da migration: ninguem do app le nem escreve. Sem GRANT novo a ninguem.
ALTER TABLE public.team_conversations_direct_pair_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_conversations_direct_pair_backfill FROM PUBLIC, anon, authenticated;

-- 2) Backfill do par ordenado (mesma regra do E27: MIN/MAX de profile_id::text) --------------
INSERT INTO public.team_conversations_direct_pair_backfill (conversation_id, direct_member_a, direct_member_b)
SELECT DISTINCT ON (p.min_pid, p.max_pid)
       p.conversation_id, p.min_pid::uuid, p.max_pid::uuid
  FROM (
    SELECT tcm.conversation_id,
           MIN(tcm.profile_id::text) AS min_pid,
           MAX(tcm.profile_id::text) AS max_pid
      FROM public.team_conversation_members tcm
     GROUP BY tcm.conversation_id
    HAVING COUNT(*) = 2
  ) p
  JOIN public.team_conversations tc
    ON tc.id = p.conversation_id
   AND tc.type = 'direct'
 WHERE tc.direct_member_a IS NULL
   AND tc.direct_member_b IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.team_conversations x
      WHERE x.type = 'direct'
        AND x.direct_member_a = p.min_pid::uuid
        AND x.direct_member_b = p.max_pid::uuid
   )
 ORDER BY p.min_pid, p.max_pid, tc.created_at, tc.id
ON CONFLICT (conversation_id) DO NOTHING;

UPDATE public.team_conversations tc
   SET direct_member_a = b.direct_member_a,
       direct_member_b = b.direct_member_b
  FROM public.team_conversations_direct_pair_backfill b
 WHERE tc.id = b.conversation_id
   AND tc.direct_member_a IS NULL
   AND tc.direct_member_b IS NULL;

-- 3) Guarda fail-closed: sem o indice unico parcial nao existe garantia de banco ------------
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'team_conversations'
       AND i.indisunique
       AND i.indpred IS NOT NULL
       AND pg_get_indexdef(i.indexrelid) LIKE '%(direct_member_a, direct_member_b)%'
       AND pg_get_indexdef(i.indexrelid) LIKE '%type = ''direct''%'
  ) THEN
    RAISE EXCEPTION 'find_or_create_direct_conversation exige o indice unico parcial (direct_member_a, direct_member_b) WHERE type = ''direct'' (20260927270007); sem ele a protecao contra criacao concorrente nao tem garantia no banco';
  END IF;
END
$guard$;

-- 4) RPC com a protecao restaurada ----------------------------------------------------------
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

  -- par ordenado: mesma regra do backfill do E27 (MIN/MAX de profile_id::text)
  IF v_my_profile_id::text < other_profile_id::text THEN
    v_a := v_my_profile_id;
    v_b := other_profile_id;
  ELSE
    v_a := other_profile_id;
    v_b := v_my_profile_id;
  END IF;

  -- 1) ja existe com o par gravado
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  WHERE c.type = 'direct'
    AND c.direct_member_a = v_a
    AND c.direct_member_b = v_b
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 2) conversa LEGADA: existe pelos membros, mas ficou sem o par gravado
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
  JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 3) criacao: a corrida e decidida pelo indice unico parcial, nao pelo SELECT acima
  INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
  VALUES ('direct', v_my_profile_id, v_a, v_b)
  ON CONFLICT (direct_member_a, direct_member_b) WHERE type = 'direct' DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    -- perdeu a corrida: quem venceu ja gravou a conversa (e os membros)
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

-- 5) ACL pela assinatura exata (mesmo estado anterior; nenhum acesso novo a ninguem) ---------
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
