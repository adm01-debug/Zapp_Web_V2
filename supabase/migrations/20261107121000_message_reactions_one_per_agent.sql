-- message_reactions_one_per_agent
-- Rollback:
--   ALTER TABLE public.message_reactions
--     DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent;
--   INSERT INTO public.message_reactions
--     SELECT * FROM public._rb_message_reactions_one_per_agent_20261107121000
--     ON CONFLICT DO NOTHING;
--   DROP TABLE IF EXISTS public._rb_message_reactions_one_per_agent_20261107121000;
--
-- A UI do inbox implementa uma reação visível por autor/mensagem, mas a chave
-- histórica incluía emoji. Duas abas (ou dois componentes no mesmo tick)
-- podiam, portanto, persistir emojis diferentes para o mesmo agente. A
-- invariável precisa estar no banco: o upsert passa a substituir atomicamente
-- o emoji do agente. user_id NULL continua admitindo reações de contato porque
-- UNIQUE no PostgreSQL trata NULLs como distintos.

SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public._rb_message_reactions_one_per_agent_20261107121000 (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid,
  contact_id uuid,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE public._rb_message_reactions_one_per_agent_20261107121000 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._rb_message_reactions_one_per_agent_20261107121000
  FROM PUBLIC, anon, authenticated, service_role;

-- Convergir legado antes de instalar a chave: preserva a reação mais recente
-- de cada agente e remove somente duplicatas que a própria UI já ocultava.
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
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.message_reactions AS reaction
USING public._rb_message_reactions_one_per_agent_20261107121000 AS backup
WHERE reaction.id = backup.id;

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_agent
  UNIQUE (message_id, user_id);

COMMENT ON CONSTRAINT message_reactions_one_per_agent ON public.message_reactions IS
  'Garante uma unica reacao de agente por mensagem; novo emoji substitui o anterior via upsert.';

COMMENT ON TABLE public._rb_message_reactions_one_per_agent_20261107121000 IS
  'Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem.';
