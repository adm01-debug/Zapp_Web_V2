SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public._rb_message_reactions_one_per_agent_20261107121000 AS
SELECT * FROM public.message_reactions WHERE false;

ALTER TABLE public._rb_message_reactions_one_per_agent_20261107121000
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._rb_message_reactions_one_per_agent_20261107121000 FROM PUBLIC, anon, authenticated;

INSERT INTO public._rb_message_reactions_one_per_agent_20261107121000
SELECT DISTINCT ON (message_id, user_id) *
FROM public.message_reactions
WHERE (message_id, user_id) IN (
  SELECT message_id, user_id
  FROM public.message_reactions
  GROUP BY message_id, user_id
  HAVING count(*) > 1
)
ORDER BY message_id, user_id, created_at DESC;

DELETE FROM public.message_reactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (PARTITION BY message_id, user_id ORDER BY created_at DESC) AS rn
    FROM public.message_reactions
  ) ranked
  WHERE rn > 1
);

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_agent UNIQUE (message_id, user_id);
