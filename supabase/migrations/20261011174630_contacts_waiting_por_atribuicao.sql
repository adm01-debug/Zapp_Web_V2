-- contacts_waiting_por_atribuicao
-- Rollback: derruba o gatilho e a funcao novos, restaura pelos valores capturados os contatos que o backfill mudou e remove a tabela auxiliar de rollback. A flag inbox.status-fsm nao e apagada.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_contacts_assignment_status_sync on public.contacts;
--   drop function if exists public.sync_conversation_status_with_assignment();
--   alter table public.contacts disable trigger update_contacts_updated_at;
--   alter table public.contacts disable trigger trg_contacts_fsm_transition;
--   update public.contacts c set conversation_status = rb.conversation_status, conversation_status_changed_at = rb.conversation_status_changed_at from public._rb_contacts_waiting_por_atribuicao rb where c.id = rb.contact_id;
--   alter table public.contacts enable trigger trg_contacts_fsm_transition;
--   alter table public.contacts enable trigger update_contacts_updated_at;
--   drop table if exists public._rb_contacts_waiting_por_atribuicao;
--
-- ADR-005, passo 4 ("Aguardando acompanha a atribuicao"): mantem
-- public.contacts.conversation_status em sincronia com public.contacts.assigned_to,
-- atras da flag inbox.status-fsm. Tirar o responsavel de um contato 'open' vira
-- 'waiting'; atribuir responsavel a um contato 'waiting' volta a 'open'. Estados
-- terminais ('resolved'/'archived') nao sao tocados.
--
-- A fonte de verdade das transicoes continua sendo o gatilho FSM
-- (trg_contacts_fsm_transition): este gatilho so PROPOE a mudanca (open<->waiting,
-- ambas validas no FSM) no mesmo UPDATE, e o FSM a valida.
--
-- Classe ADITIVA: funcao + gatilho novos, tabela auxiliar de rollback do backfill e 1 linha de flag desligada quando ausente.

-- Chave operacional para ligar/desligar o gatilho sem deploy. Se a chave nao
-- existir, nasce DESLIGADA para que a promocao nao mova conversas sozinha; ligar
-- a flag e decisao operacional do Joaquim. Se a chave ja existir, o valor vigente
-- e preservado (ON CONFLICT DO NOTHING).
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'inbox.status-fsm',
  false,
  'Sincroniza contacts.conversation_status com a atribuicao (Aguardando <-> Atendendo).'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_conversation_status_with_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Desligada (ou ausente): nada muda, o estado segue como o chamador mandou.
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE key = 'inbox.status-fsm' AND enabled IS TRUE
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL AND OLD.assigned_to IS NOT NULL
     AND NEW.conversation_status = 'open' THEN
    NEW.conversation_status := 'waiting';
    NEW.conversation_status_changed_at := now();
  ELSIF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL
     AND NEW.conversation_status = 'waiting' THEN
    NEW.conversation_status := 'open';
    NEW.conversation_status_changed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contacts_assignment_status_sync ON public.contacts;
CREATE TRIGGER trg_contacts_assignment_status_sync
  BEFORE UPDATE OF assigned_to ON public.contacts
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.sync_conversation_status_with_assignment();

-- Gatilho nao e chamado pelo cliente: sem EXECUTE para ninguem alem do dono.
REVOKE EXECUTE ON FUNCTION public.sync_conversation_status_with_assignment() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_conversation_status_with_assignment() IS
  'Mantem contacts.conversation_status em sincronia com assigned_to (open<->waiting), atras da flag inbox.status-fsm. Estados terminais nao sao tocados.';

-- ---------------------------------------------------------------------------
-- Backfill (ADR-005, passo 4): contatos 'open', sem responsavel e com pelo menos
-- uma mensagem passam a 'waiting'. Idempotente: apos a primeira rodada o
-- predicado deixa de casar. O gatilho update_contacts_updated_at e desligado SO
-- durante o backfill para nao reescrever updated_at de linhas existentes; o
-- gatilho FSM segue ligado e valida open -> waiting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._rb_contacts_waiting_por_atribuicao (
  contact_id uuid PRIMARY KEY,
  conversation_status text NOT NULL,
  conversation_status_changed_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._rb_contacts_waiting_por_atribuicao IS
  'Valores anteriores do backfill contacts_waiting_por_atribuicao, usados apenas pelo rollback da migration 20261011174630.';

-- Tabela interna de rollback: nao fica acessivel a clientes via grants padrao.
REVOKE ALL ON TABLE public._rb_contacts_waiting_por_atribuicao FROM PUBLIC, anon, authenticated;

ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;

INSERT INTO public._rb_contacts_waiting_por_atribuicao (
  contact_id,
  conversation_status,
  conversation_status_changed_at
)
SELECT c.id,
       c.conversation_status,
       c.conversation_status_changed_at
  FROM public.contacts c
 WHERE c.conversation_status = 'open'
   AND c.assigned_to IS NULL
   AND EXISTS (SELECT 1 FROM public.messages m WHERE m.contact_id = c.id)
   AND EXISTS (
     SELECT 1 FROM public.feature_flags
     WHERE key = 'inbox.status-fsm' AND enabled IS TRUE
   )
ON CONFLICT (contact_id) DO NOTHING;

UPDATE public.contacts c
   SET conversation_status = 'waiting',
       conversation_status_changed_at = now()
  FROM public._rb_contacts_waiting_por_atribuicao rb
 WHERE rb.contact_id = c.id
   AND c.conversation_status = 'open'
   AND c.assigned_to IS NULL
   AND EXISTS (
     SELECT 1 FROM public.feature_flags
     WHERE key = 'inbox.status-fsm' AND enabled IS TRUE
   );

ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;
