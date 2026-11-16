SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public._rb_message_reactions_one_per_agent_20261107121000 AS
SELECT * FROM public.message_reactions WHERE false;

ALTER TABLE public._rb_message_reactions_one_per_agent_20261107121000
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._rb_message_reactions_one_per_agent_20261107121000 FROM PUBLIC, anon, authenticated;

-- A tabela de rollback tem de guardar o que o DELETE abaixo REMOVE (rn > 1), e
-- nao a linha que sobrevive. O `DISTINCT ON ... ORDER BY created_at DESC`
-- anterior salvava justamente a sobrevivente: o backup nao permitia desfazer
-- nada. Mesmo predicado do DELETE, para os dois andarem sempre juntos.
INSERT INTO public._rb_message_reactions_one_per_agent_20261107121000
  (id, message_id, user_id, contact_id, emoji, created_at)
SELECT id, message_id, user_id, contact_id, emoji, created_at
FROM (
  SELECT id, message_id, user_id, contact_id, emoji, created_at,
         row_number() OVER (PARTITION BY message_id, user_id ORDER BY created_at DESC) AS rn
  FROM public.message_reactions
  WHERE user_id IS NOT NULL
) ranked
WHERE rn > 1;

-- A constraint abaixo e UNIQUE (message_id, user_id) SIMPLES: no Postgres NULL e
-- distinto de NULL, entao reacao de CONTATO (user_id IS NULL, garantido por
-- reaction_author_check) nunca a violaria. Mas `PARTITION BY message_id, user_id`
-- agrupa os NULL entre si, e sem o filtro este DELETE apagava reacoes de clientes
-- que a constraint jamais rejeitaria. Hoje 109 das 115 reacoes do projeto oficial
-- sao de contato, entao o filtro e o que separa um replay seguro de perda de dado.
DELETE FROM public.message_reactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (PARTITION BY message_id, user_id ORDER BY created_at DESC) AS rn
    FROM public.message_reactions
    WHERE user_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_agent UNIQUE (message_id, user_id);
