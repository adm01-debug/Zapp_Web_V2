-- contacts_consent_status_guard
-- Rollback: dropa o gatilho de guarda do consentimento, a funcao dele e o CHECK dos valores validos.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_contacts_consent_status_guard on public.contacts;
--   drop function if exists public.enforce_contacts_consent_status_guard();
--   alter table public.contacts drop constraint if exists contacts_consent_status_valores;
--
-- LGPD (N10 do Talk X): `contacts.consent_status` nasceu TEXT DEFAULT 'unknown' sem CHECK
-- (20260409014536:139) e a policy de UPDATE de `contacts` deixa quem passa em
-- `can_edit_contact` alterar QUALQUER coluna. Como o Talk X exclui sempre `revoked` da
-- audiencia e, com `require_granted_consent`, exige `granted`, um atendente podia trocar
-- `revoked` por `granted` num UPDATE direto e reabrir o envio para quem pediu para sair.
--
-- Esta migration e ADITIVA e faz duas coisas, sem tocar no que o Talk X ja faz:
--   (1) CHECK com os valores validos do eixo de consentimento — a lista vem do codigo que
--       le/escreve a coluna (Talk X: 'revoked' excluido, 'granted' exigido) e da UI de
--       segmentos do Talk X (`src/components/talkx/segments/RuleValueInput.tsx`: granted |
--       unknown | revoked). A coluna e nullable desde a criacao e a base inteira esta em
--       'unknown'; NULL segue aceito (o CHECK restringe os valores INFORMADOS) — nao ha
--       backfill de dado aqui.
--   (2) gatilho BEFORE UPDATE que recusa a troca de `consent_status` feita por quem nao e
--       admin, service_role nem rotina interna de consentimento (CS1/CS2: `talkx_suppress_contact`,
--       SECURITY DEFINER que roda com auth.role() = 'service_role'), e registra a tentativa
--       em `audit_logs`.
--
-- Por que a tentativa NAO e "a muda e reverte" (nao se levanta EXCEPTION):
--   um RAISE dentro do gatilho aborta a transacao inteira do UPDATE — inclusive o proprio
--   INSERT em audit_logs, que faria rollback junto. A trilha exigida se perderia. Entao a
--   mudanca e descartada (o UPDATE segue e a coluna fica com o valor antigo) e a tentativa
--   fica registrada de forma duravel, na MESMA transacao do UPDATE: ou o contato e a trilha
--   ficam os dois, ou nada fica (atomico).

-- ============================================================================
-- (1) CHECK dos valores validos
-- ============================================================================
-- NOT VALID + VALIDATE: a constraint passa a valer para as escritas novas ja no ADD e a
-- varredura da tabela existente acontece no VALIDATE, sem bloquear a escrita. Sem mudanca de dado.
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_consent_status_valores
  CHECK (consent_status IS NULL OR consent_status IN ('granted', 'unknown', 'revoked')) NOT VALID;

ALTER TABLE public.contacts
  VALIDATE CONSTRAINT contacts_consent_status_valores;

COMMENT ON CONSTRAINT contacts_consent_status_valores ON public.contacts IS
  'Eixo de consentimento (LGPD/Talk X): so granted, unknown ou revoked. NULL = nao informado (a coluna nasceu nullable; estado legado, sem backfill nesta migration).';

-- ============================================================================
-- (2) Guarda de escrita de consent_status
-- ============================================================================
-- SECURITY DEFINER porque a funcao grava em public.audit_logs, cuja unica policy de INSERT
-- e "Block authenticated inserts on audit_logs" (WITH CHECK false): como INVOKER o gatilho
-- nao teria como registrar a tentativa. SET search_path fixo (com pg_temp) nos dois corpus.
CREATE OR REPLACE FUNCTION public.enforce_contacts_consent_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Sem mudanca real do eixo (inclui o UPDATE que reescreve o mesmo valor): segue.
  IF NEW.consent_status IS NOT DISTINCT FROM OLD.consent_status THEN
    RETURN NEW;
  END IF;

  -- Caminhos autorizados:
  --   * service_role  -> rotina interna de consentimento (talkx_suppress_contact roda com
  --                      auth.role() = 'service_role') e a service key.
  --   * sem JWT       -> conexao direta do dono (migracao/backfill/psql de servico): nao ha
  --                      request do PostgREST, logo auth.role()/auth.uid() vem vazios.
  --   * admin         -> unico papel de aplicacao que decide consentimento direto. supervisor
  --                      NAO entra aqui de proposito (a decisao legal e do admin).
  IF COALESCE(auth.role(), '') IN ('service_role', '')
     OR COALESCE(public.has_role(auth.uid(), 'admin'), false) THEN
    RETURN NEW;
  END IF;

  -- Negado (agent, supervisor e qualquer outro papel com JWT): registra a tentativa em
  -- audit_logs (sem PII: so o id do contato e os dois estados) e descarta a mudanca.
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'contact_consent_status_change_denied',
    'contacts',
    OLD.id,
    jsonb_build_object(
      'contact_id', OLD.id,
      'from', OLD.consent_status,
      'to', NEW.consent_status
    )
  );

  NEW.consent_status := OLD.consent_status;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_contacts_consent_status_guard() IS
  'Guarda LGPD de public.contacts.consent_status: barra a troca do eixo fora de admin/service_role/rotina interna (talkx_suppress_contact) e registra a tentativa em audit_logs (action=contact_consent_status_change_denied). A mudanca negada e descartada sem EXCEPTION para que a propria trilha de auditoria nao faca rollback com o resto da transacao.';

-- Criada/reaproveitada de forma idempotente (replay de migration nao duplica gatilho).
DROP TRIGGER IF EXISTS trg_contacts_consent_status_guard ON public.contacts;

CREATE TRIGGER trg_contacts_consent_status_guard
BEFORE UPDATE OF consent_status
ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contacts_consent_status_guard();

-- O gatilho nao e chamavel pelo cliente: o EXECUTE de funcao de gatilho nao e checado pelo
-- PostgreSQL na DML que o dispara, entao fechar o EXECUTE (que nasce aberto para PUBLIC)
-- nao muda o comportamento do gatilho e tira a superficie da funcao.
REVOKE ALL ON FUNCTION public.enforce_contacts_consent_status_guard() FROM PUBLIC, anon, authenticated;
