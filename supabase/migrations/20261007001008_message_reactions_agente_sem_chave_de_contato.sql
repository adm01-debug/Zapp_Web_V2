-- message_reactions_agente_sem_chave_de_contato
-- Rollback: DROP TRIGGER IF EXISTS message_reactions_normalize_author ON public.message_reactions;
-- Rollback: UPDATE public.message_reactions r SET contact_id = b.contact_id_original FROM public._rb_message_reactions_contato_20261006 b WHERE b.reaction_id = r.id;
-- Rollback: DROP TABLE IF EXISTS public._rb_message_reactions_contato_20261006;
-- Rollback: DROP FUNCTION IF EXISTS public.message_reactions_normalize_author();
--
-- R2-DB-021 / item 303 (P2). A tabela public.message_reactions mantinha DUAS
-- unicidades independentes: (message_id, user_id, emoji) e (message_id, contact_id,
-- emoji). O hook de reacao de agente grava user_id E contact_id ao mesmo tempo, mas
-- escolhe ON CONFLICT apenas por (message_id, user_id, emoji). Assim a SEGUNDA
-- reacao de agente ao MESMO emoji na MESMA mensagem (outro user_id, mesmo contact_id
-- de contexto) colidia na chave reservada ao contato -> 23505 e a reacao se perdia.
-- Uma reacao de cliente (user_id NULL) com o mesmo emoji tambem disputava essa chave.
--
-- MODELO INEQUIVOCO DE AUTORIA: user_id identifica o AUTOR agente; contact_id fica
-- reservado ao AUTOR cliente. O vinculo contextual da mensagem com o contato continua
-- em public.messages.contact_id (via message_id), por isso a reacao de agente nao
-- precisa repetir contact_id. O gatilho normaliza a linha escrita por qualquer
-- chamador (hook, edge, service_role, backfill), sem tocar nas duas unicidades -- o
-- que preserva o alvo de UPSERT por (message_id, contact_id, emoji) do webhook de
-- reacao de cliente (supabase/functions/_shared/evolution-helpers.ts).
--
-- Sem perda para o autor: o CHECK reaction_author_check segue exigindo user_id OU
-- contact_id e a unicidade por autor e por contato continua valendo.
-- O rollback NAO devolve o contact_id de linhas de agente gravadas DEPOIS desta
-- migration (elas nascem com contact_id nulo por desenho); devolve exatamente as
-- linhas que a migration anulou, a partir da tabela de apoio.

-- 1) Gatilho de normalizacao de autoria (agente x cliente).
CREATE OR REPLACE FUNCTION public.message_reactions_normalize_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    NEW.contact_id := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.message_reactions_normalize_author() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS message_reactions_normalize_author ON public.message_reactions;
CREATE TRIGGER message_reactions_normalize_author
  BEFORE INSERT OR UPDATE ON public.message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.message_reactions_normalize_author();

-- 2) Tabela de apoio do rollback: guarda o contact_id que a migration anula.
CREATE TABLE IF NOT EXISTS public._rb_message_reactions_contato_20261006 (
  reaction_id uuid PRIMARY KEY,
  contact_id_original uuid NOT NULL
);
ALTER TABLE public._rb_message_reactions_contato_20261006 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._rb_message_reactions_contato_20261006 FROM PUBLIC, anon, authenticated, service_role;

-- 3) Backfill: as linhas de agente ja gravadas saem da chave de contato. Sem isto,
--    uma reacao de CLIENTE com o mesmo emoji continuaria colidindo com a reacao de
--    agente legada em (message_id, contact_id, emoji).
INSERT INTO public._rb_message_reactions_contato_20261006 (reaction_id, contact_id_original)
SELECT id, contact_id
  FROM public.message_reactions
 WHERE user_id IS NOT NULL
   AND contact_id IS NOT NULL
ON CONFLICT (reaction_id) DO NOTHING;

UPDATE public.message_reactions
   SET contact_id = NULL
 WHERE user_id IS NOT NULL
   AND contact_id IS NOT NULL;
