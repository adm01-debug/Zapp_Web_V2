-- f34_multiplix_events_append_only
-- versão 20261001251230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:27-03:00 (hermes-db-migrar --nova)

-- rollback: DROP TRIGGER IF EXISTS trg_guard_multiplix_event_immutable ON public.multiplix_events;
-- rollback: DROP FUNCTION IF EXISTS public.guard_multiplix_event_immutable();
-- rollback: DROP TABLE IF EXISTS public.multiplix_events;
-- rollback: -- (o DROP TABLE leva junto as FKs, indices, policies e grants; nao ha dado a reverter
-- rollback: --  porque a tabela e nova e append-only. service_role nao fica com privilegio orfao.)

-- ============================================================================
-- F34 · Multiplix — `multiplix_events` (trilha append-only do motor de envio)
-- Bloco C do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md (linha 70).
-- ============================================================================
--
-- ESTADO DE ENTRADA (medido no canonico tnnnlkbymytvtqngbbqh, 2026-10-01):
--   `multiplix_events` nao existe. `multiplix_dispatches` e `multiplix_recipients` existem
--   (com `id uuid` PK). `multiplix_delivery_items` (F32) NAO existe ainda -> item_id entra como
--   uuid simples, sem FK inline (a FK para a tabela de itens do F32 sera adicionada quando ela
--   existir; o trigger ja suporta o "zerar" de item_id).
--
-- VOCABULARIO DE `kind` (texto + CHECK, nao enum):
--   A trilha vai crescer em varias etapas (bloco D/E); um enum exigiria ALTER TYPE ADD VALUE e
--   este modulo ja foi mordido por `ALTER TYPE` (F30). `text + CHECK` permite evoluir o vocabulario
--   com DROP/ADD CONSTRAINT e e o mesmo desenho da tabela irma public.talkx_campaign_events
--   (event_type text + CHECK). Valores iniciais:
--     dispatch_created, dispatch_scheduled, dispatch_started, dispatch_paused, dispatch_resumed,
--     dispatch_completed, dispatch_failed, dispatch_cancelled,
--     recipient_queued, recipient_claimed, recipient_sent, recipient_delivered, recipient_read,
--     recipient_failed, recipient_skipped, recipient_cancelled, recipient_outcome_unknown,
--     item_queued, item_claimed, item_sent, item_delivered, item_read, item_failed,
--     item_rescheduled, item_dead_letter, item_skipped, item_cancelled,
--     note
--
-- DECISAO DO DONO (verbatim): "troque a FK para ON DELETE RESTRICT, porque evento e registro
-- historico. Se algum fluxo precisar apagar o pai, o trigger pode permitir apenas o UPDATE que
-- zera a FK, e nenhum outro." -> implementado ao pe da letra:
--   * dispatch_id FK -> multiplix_dispatches ON DELETE RESTRICT; recipient_id FK ->
--     multiplix_recipients ON DELETE RESTRICT.
--   * trigger BEFORE UPDATE OR DELETE: DELETE sempre rejeitado; UPDATE rejeitado, EXCETO o cujo
--     UNICO efeito e zerar uma das FKs (dispatch_id/recipient_id/item_id), com todas as outras
--     colunas identicas. Qualquer outro UPDATE (inclusive no-op) e rejeitado.
--   NOTA DE TENSAO (medida, nao escondida): `dispatch_id` e NOT NULL por decisao do dono, entao na
--   pratica so `recipient_id`/`item_id` podem ser zerados — um dispatch com eventos nunca sera
--   apagado enquanto a FK RESTRICT existir. Isso e coerente com "evento e registro historico";
--   o ramo de dispatch_id no trigger existe por simetria e nao abre excecao real (o NOT NULL
--   barra logo depois, na mesma transacao).
--
-- APPEND-ONLY DE VERDADE: sem INSERT/UPDATE/DELETE para authenticated (so SELECT). Escrita e
-- service_role. TRUNCATE e REVOGADO de todos (inclui service_role): TRUNCATE NAO passa por RLS e
-- NAO dispara trigger de linha, entao seria um furo na trilha.
-- Precedentes copiados: guard_talkx_template_version_immutable (20260909210000),
-- grants append-only de catalog_send_events (20260929650000) / talkx_campaign_events (20260929840000).

-- ---------- 1. tabela ----------
CREATE TABLE IF NOT EXISTS public.multiplix_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id    uuid        NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE RESTRICT,
  recipient_id   uuid                 REFERENCES public.multiplix_recipients(id) ON DELETE RESTRICT,
  item_id        uuid,
  kind           text        NOT NULL,
  payload        jsonb,
  correlation_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_events_kind_check CHECK (kind IN (
    'dispatch_created','dispatch_scheduled','dispatch_started','dispatch_paused','dispatch_resumed',
    'dispatch_completed','dispatch_failed','dispatch_cancelled',
    'recipient_queued','recipient_claimed','recipient_sent','recipient_delivered','recipient_read',
    'recipient_failed','recipient_skipped','recipient_cancelled','recipient_outcome_unknown',
    'item_queued','item_claimed','item_sent','item_delivered','item_read','item_failed',
    'item_rescheduled','item_dead_letter','item_skipped','item_cancelled',
    'note'
  ))
);

-- ---------- 2. indices ----------
-- (dispatch_id, created_at DESC): leitura natural da trilha de um dispatch.
CREATE INDEX IF NOT EXISTS idx_multiplix_events_dispatch_created
  ON public.multiplix_events (dispatch_id, created_at DESC);

-- indice de apoio a FK (checagem RESTRICT) e a leitura por destinatario.
CREATE INDEX IF NOT EXISTS idx_multiplix_events_recipient
  ON public.multiplix_events (recipient_id) WHERE recipient_id IS NOT NULL;

-- rastreio por correlacao (propagacao do correlation_id pelo envio — F43).
CREATE INDEX IF NOT EXISTS idx_multiplix_events_correlation
  ON public.multiplix_events (correlation_id) WHERE correlation_id IS NOT NULL;

-- ---------- 3. RLS: leitura via dispatch acessivel ----------
ALTER TABLE public.multiplix_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view events of accessible dispatches" ON public.multiplix_events;
CREATE POLICY "Users can view events of accessible dispatches" ON public.multiplix_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_events.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated (escrita e service_role). A policy de
-- leitura acima NAO cita `md.status` de proposito: nao carrega a dependencia que trava o
-- ALTER TYPE do F30.

-- ---------- 4. grants (append-only) ----------
-- REVOKE ALL inclui TRUNCATE e DELETE, que nao passam por RLS/trigger de linha. service_role
-- recebe so SELECT/INSERT/UPDATE (UPDATE existe apenas para o fluxo de zerar a FK).
REVOKE ALL ON TABLE public.multiplix_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.multiplix_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.multiplix_events TO service_role;

-- ---------- 5. guard append-only ----------
-- SECURITY INVOKER (nao faz nada privilegiado). DELETE sempre rejeitado; UPDATE rejeitado
-- exceto o unico-efeito de zerar FK. INSERT nao e tocado (a trilha so cresce).
CREATE OR REPLACE FUNCTION public.guard_multiplix_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_any_unlink boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'multiplix_event_delete_denied' USING ERRCODE = '55000';
  END IF;

  -- TG_OP = 'UPDATE'
  v_any_unlink :=
       (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL)
    OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL)
    OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL);

  IF v_any_unlink
     AND (NEW.id             IS NOT DISTINCT FROM OLD.id)
     AND (NEW.kind           IS NOT DISTINCT FROM OLD.kind)
     AND (NEW.payload        IS NOT DISTINCT FROM OLD.payload)
     AND (NEW.correlation_id IS NOT DISTINCT FROM OLD.correlation_id)
     AND (NEW.created_at     IS NOT DISTINCT FROM OLD.created_at)
     AND ((NEW.dispatch_id  IS NOT DISTINCT FROM OLD.dispatch_id)
          OR (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL))
     AND ((NEW.recipient_id IS NOT DISTINCT FROM OLD.recipient_id)
          OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL))
     AND ((NEW.item_id      IS NOT DISTINCT FROM OLD.item_id)
          OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'multiplix_event_immutable' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_multiplix_event_immutable ON public.multiplix_events;
CREATE TRIGGER trg_guard_multiplix_event_immutable
BEFORE UPDATE OR DELETE ON public.multiplix_events
FOR EACH ROW EXECUTE FUNCTION public.guard_multiplix_event_immutable();

REVOKE ALL ON FUNCTION public.guard_multiplix_event_immutable() FROM PUBLIC, anon, authenticated;

-- ---------- 6. documentacao ----------
COMMENT ON TABLE public.multiplix_events IS
  'Trilha append-only do motor de envio Multiplix (F34). So cresce: DELETE sempre rejeitado e '
  'UPDATE so e aceito quando seu unico efeito e zerar uma FK (trigger guard_multiplix_event_immutable). '
  'FKs: dispatch_id e recipient_id ON DELETE RESTRICT (evento e registro historico).';
COMMENT ON COLUMN public.multiplix_events.kind IS
  'Tipo do evento. Vocabulario inicial (text+CHECK): dispatch_*/recipient_*/item_* + note. Evolui por migration.';
COMMENT ON COLUMN public.multiplix_events.payload IS
  'Dados do evento (livre). Nao guardar segredo/PII: a leitura por authenticated passa pela RLS do dispatch.';
