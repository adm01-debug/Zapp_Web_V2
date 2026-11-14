-- reaplica_talk_me_pending_history
--
-- Por que existe: o ledger (supabase_migrations.schema_migrations) registrou a versao
-- 20261011010100 (talk_me_pending_history_origins) com statements NULL, e o estado vivo
-- de producao NAO bate com o arquivo. A funcao viva ainda e a v1 de 20261011010003.
-- Prova (SELECT em producao, 2026-11-14):
--   SELECT md5(pg_get_functiondef(p.oid)),
--          pg_get_functiondef(p.oid) ~ 'outbound_context',
--          pg_get_functiondef(p.oid) ~ 'internal_notes',
--          obj_description(p.oid, 'pg_proc'), p.proacl
--   FROM pg_proc p WHERE p.proname = 'talk_me_list_pending_messages';
--   -> ffd4215c4fccaeea17e29f972d087267 | false | false | NULL |
--      {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   ledger: 20261011010003 e 20261011010100 com array_length(statements,1) NULL.
--   Gatilho trg_guard_message_provenance_fields em public.messages: presente (1).
-- Impacto: quem assume um atendimento no TALK ME ve so as mensagens do cliente; a
-- ultima saida anterior e as notas internas (rotulos 'Saida' e 'Nota interna' em
-- src/features/talk-me/TalkMeView.tsx) nunca chegam.
--
-- O que faz: reaplica, byte-identico, o corpo de 20261011010100 (guarda do gatilho,
-- CREATE OR REPLACE com o mesmo contrato de retorno, SECURITY DEFINER, search_path,
-- ACL e COMMENT). Nenhuma migration posterior redefine esta funcao. Sem reparo de
-- dados. Idempotente: pode rodar duas vezes.
--
-- Rollback: voltar a v1 executando o bloco "Rollback" comentado no topo de
-- supabase/migrations/20261011010100_talk_me_pending_history_origins.sql
-- (mesma assinatura e retorno; REVOKE/GRANT/COMMENT iguais).

DO $$
BEGIN
  IF to_regclass('public.messages') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger t
       WHERE t.tgrelid = 'public.messages'::regclass
         AND t.tgname = 'trg_guard_message_provenance_fields'
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION 'talk_me_pending_history_requires_provenance_trigger';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.talk_me_list_pending_messages(
  p_contact_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  message_id uuid,
  sender text,
  content text,
  message_type text,
  media_url text,
  caption text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH caller AS (
    SELECT
      auth.uid() AS user_id,
      (
        SELECT p.id
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.is_active IS TRUE
        LIMIT 1
      ) AS profile_id,
      public.is_admin_or_supervisor(auth.uid()) AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.feature_flags f
        WHERE f.key = 'inbox.talk-me'
          AND f.enabled IS TRUE
      ) AS feature_enabled
  ),
  authorized_contact AS (
    SELECT e.contact_id
    FROM public.talk_me_eligible_waiting_contacts(NULL, p_contact_id) e
    CROSS JOIN caller x
    WHERE x.user_id IS NOT NULL
      AND x.profile_id IS NOT NULL
      AND x.feature_enabled
      AND EXISTS (
        SELECT 1
        FROM public.queues q
        WHERE q.id = e.queue_id
          AND q.is_active = true
      )
      AND (
        x.is_admin
        OR EXISTS (
          SELECT 1
          FROM public.queue_members qm
          WHERE qm.queue_id = e.queue_id
            AND qm.profile_id = x.profile_id
            AND qm.is_active = true
        )
      )
  ),
  pending_messages AS (
    SELECT
      m.id AS message_id,
      m.sender,
      m.content,
      m.message_type,
      m.media_url,
      m.caption,
      m.created_at
    FROM public.messages m
    JOIN authorized_contact ac ON ac.contact_id = m.contact_id
    WHERE m.sender = 'contact'
      AND COALESCE(m.is_deleted, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.messages agent_message
        WHERE agent_message.contact_id = m.contact_id
          AND agent_message.sender = 'agent'
          AND COALESCE(agent_message.is_deleted, false) = false
          AND (agent_message.created_at, agent_message.id) >= (m.created_at, m.id)
      )
  ),
  first_pending AS (
    SELECT pm.message_id, pm.created_at
    FROM pending_messages pm
    ORDER BY pm.created_at ASC, pm.message_id ASC
    LIMIT 1
  ),
  outbound_context AS (
    SELECT
      m.id AS message_id,
      m.sender,
      m.content,
      m.message_type,
      m.media_url,
      m.caption,
      m.created_at
    FROM public.messages m
    JOIN authorized_contact ac ON ac.contact_id = m.contact_id
    CROSS JOIN first_pending fp
    WHERE m.sender = 'agent'
      AND COALESCE(m.is_deleted, false) = false
      AND (m.created_at, m.id) < (fp.created_at, fp.message_id)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ),
  internal_notes AS (
    SELECT
      n.id AS message_id,
      'system'::text AS sender,
      n.content,
      'internal_note'::text AS message_type,
      NULL::text AS media_url,
      NULL::text AS caption,
      n.created_at
    FROM public.contact_notes n
    JOIN authorized_contact ac ON ac.contact_id = n.contact_id
    CROSS JOIN first_pending fp
    WHERE n.created_at >= fp.created_at
  ),
  history_events AS (
    SELECT * FROM pending_messages
    UNION ALL
    SELECT * FROM outbound_context
    UNION ALL
    SELECT * FROM internal_notes
  ),
  recent AS (
    SELECT event.*
    FROM history_events event
    ORDER BY event.created_at DESC, event.message_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  )
  SELECT
    r.message_id,
    r.sender,
    r.content,
    r.message_type,
    r.media_url,
    r.caption,
    r.created_at
  FROM recent r
  ORDER BY r.created_at ASC, r.message_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.talk_me_list_pending_messages(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talk_me_list_pending_messages(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.talk_me_list_pending_messages(uuid, integer) IS
  'Historico do bloco pendente TALK ME: saida anterior, mensagens do cliente e notas internas, sem aceite nem marcacao de lida, com autorizacao revalidada.';
