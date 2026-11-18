SET search_path = public, pg_temp

CREATE TABLE IF NOT EXISTS public._rb_message_reactions_one_per_agent_20261107121000 (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid,
  contact_id uuid,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL
)

ALTER TABLE public._rb_message_reactions_one_per_agent_20261107121000 ENABLE ROW LEVEL SECURITY

REVOKE ALL ON TABLE public._rb_message_reactions_one_per_agent_20261107121000
  FROM PUBLIC, anon, authenticated, service_role

WITH ranked AS (
  SELECT reaction.*,
         row_number() OVER (
           PARTITION BY reaction.message_id, reaction.user_id
           ORDER BY reaction.created_at DESC, reaction.id DESC
         ) AS position
  FROM public.message_reactions AS reaction
  WHERE reaction.user_id IS NOT NULL
)
INSERT INTO public._rb_message_reactions_one_per_agent_20261107121000
  (id, message_id, user_id, contact_id, emoji, created_at)
SELECT id, message_id, user_id, contact_id, emoji, created_at
FROM ranked
WHERE position > 1
ON CONFLICT (id) DO NOTHING

DELETE FROM public.message_reactions AS reaction
USING public._rb_message_reactions_one_per_agent_20261107121000 AS backup
WHERE reaction.id = backup.id

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_agent
  UNIQUE (message_id, user_id)

COMMENT ON CONSTRAINT message_reactions_one_per_agent ON public.message_reactions IS
  'Garante uma unica reacao de agente por mensagem; novo emoji substitui o anterior via upsert.'

COMMENT ON TABLE public._rb_message_reactions_one_per_agent_20261107121000 IS
  'Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem.'
