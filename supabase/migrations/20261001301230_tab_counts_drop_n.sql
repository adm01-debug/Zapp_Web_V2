-- migration: tab_counts_drop_n
-- Etapa 97 — remove `reminders_pending` do RETURNS TABLE de get_conversation_tab_counts.
-- Classe: CONTRATO. PR SEPARADA e SEM MERGE: aguarda APROVADO.
--
-- Por que DROP + CREATE e nao CREATE OR REPLACE: o PostgreSQL recusa trocar o tipo de retorno de uma
-- funcao existente ("cannot change return type of existing function" — HINT: use DROP FUNCTION first).
-- Testado em PostgreSQL descartavel: com CREATE OR REPLACE a migration "passava" sem efeito nenhum.
-- O DROP leva os grants junto, por isso o REVOKE/GRANT e repetido no fim (mesmo padrao da
-- 20260909200000_harden_inbox_contact_authorization.sql).
-- Tudo roda dentro da transacao do runner, entao nao existe janela sem a funcao para outros clientes.
--
-- nomes-antigos-conferidos: get_conversation_tab_counts — o NOME NAO MUDA e nao e rename: a funcao e
-- recriada com o mesmo nome e a mesma assinatura de entrada (p_contact_id uuid). O DROP existe apenas
-- porque o PostgreSQL recusa trocar o RETURNS TABLE com CREATE OR REPLACE. O front continua chamando o
-- MESMO RPC; o que sai e a coluna do retorno.
-- rollback: 1) DROP FUNCTION IF EXISTS public.get_conversation_tab_counts(uuid);
-- rollback: 2) recriar com a coluna a partir de supabase/migrations/20260928140200_tab_counts_tasks_own.sql (CREATE FUNCTION, mesmo corpo, RETURNS TABLE com reminders_pending integer);
-- rollback: 3) REVOKE ALL ON FUNCTION public.get_conversation_tab_counts(uuid) FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;
-- rollback: (o CREATE OR REPLACE NAO serve para volta: o PostgreSQL recusa trocar o tipo de retorno nos dois sentidos — testado em PostgreSQL descartavel)
DROP FUNCTION IF EXISTS public.get_conversation_tab_counts(uuid);

CREATE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(
  tasks_open   integer,
  notes_total  integer,
  files_total  integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'contact is not visible to current user'
      USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.current_profile_id();

  RETURN QUERY
  SELECT
    -- tasks abertas DO USUARIO ATUAL para este contato
    (SELECT count(*)::integer
     FROM public.conversation_tasks AS t
     WHERE t.contact_id = p_contact_id
       AND t.created_by = v_profile_id
       AND t.status NOT IN ('done','cancelled')),
    -- notas totais (inalterado)
    (SELECT count(*)::integer
     FROM public.contact_notes AS n
     WHERE n.contact_id = p_contact_id),
    -- arquivos (inalterado)
    (SELECT count(*)::integer
     FROM public.messages AS m
     WHERE m.contact_id = p_contact_id
       AND m.media_url IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_tab_counts(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(uuid)
  TO authenticated;
