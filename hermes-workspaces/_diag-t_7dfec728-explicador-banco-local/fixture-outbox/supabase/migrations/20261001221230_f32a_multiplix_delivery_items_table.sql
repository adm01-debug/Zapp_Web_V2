-- f32a_multiplix_delivery_items_table
-- versão 20261001221230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:24-03:00 (hermes-db-migrar --nova)

-- rollback: DROP TABLE IF EXISTS public.multiplix_delivery_items;
-- rollback: DROP INDEX IF EXISTS public.idx_multiplix_dispatches_created_by_created_at;
--
-- F32 (parte 1 de 2) · Multiplix — fila de itens (recipient x bloco).
--
-- A fila hoje e por destinatario (`multiplix_recipients`); com blocos, cada destinatario
-- tem N itens (um por bloco), e o worker precisa reivindicar, tentar e reenviar ITEM a
-- item — sem reenviar o destinatario inteiro por causa de um bloco que falhou.
--
-- `idempotency_key` e coluna GERADA (sha256 de dispatch_id:dispatch_version:recipient_id:block_id):
--   * `extensions.digest` SEMPRE qualificado — o pgcrypto vive no schema `extensions`
--     e `digest(...)` sem schema da 42883 (medido nesta serie);
--   * `convert_to`/`concat` sao STABLE e nao servem em coluna gerada (exige IMMUTABLE);
--     o operador `||` com casts e `extensions.digest` sao IMMUTABLE;
--   * `dispatch_version` entra DESNORMALIZADO aqui: coluna gerada nao le outra tabela.
--
-- `status` usa o enum `multiplix_item_status` (criado em F30), que e o vocabulario do
-- recipient + `failed_transient` — este ultimo e o que o indice parcial da fila filtra
-- junto de `pending`, e nao existe no CHECK do recipient.
--
-- Indices (o plano pede os tres): o parcial da fila, o de dispatch+status e o de
-- dispatches por (created_by, created_at DESC) para a tela de historico.
--
-- Depende de: F30 (enum multiplix_item_status), F31 (multiplix_dispatches.dispatch_version).

CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.multiplix_recipients(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.multiplix_blocks(id) ON DELETE CASCADE,
  dispatch_version integer NOT NULL,
  status public.multiplix_item_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp with time zone,
  lease_token uuid,
  lease_until timestamp with time zone,
  worker_id text,
  external_id text,
  personalized_message text,
  provider_dispatch_started_at timestamp with time zone,
  idempotency_key text GENERATED ALWAYS AS (
    encode(
      extensions.digest(
        dispatch_id::text || ':' || dispatch_version::text || ':'
          || recipient_id::text || ':' || block_id::text,
        'sha256'
      ),
      'hex'
    )
  ) STORED,
  error_class text,
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_delivery_items_idempotency_key_key UNIQUE (idempotency_key)
);

-- fila: e este indice que o claim em lote tem de usar (o plano exige EXPLAIN provando)
CREATE INDEX idx_multiplix_delivery_items_queue
  ON public.multiplix_delivery_items (status, next_attempt_at)
  WHERE status IN ('pending', 'failed_transient');

CREATE INDEX idx_multiplix_delivery_items_dispatch_status
  ON public.multiplix_delivery_items (dispatch_id, status);

CREATE INDEX idx_multiplix_dispatches_created_by_created_at
  ON public.multiplix_dispatches (created_by, created_at DESC);

CREATE TRIGGER update_multiplix_delivery_items_updated_at
  BEFORE UPDATE ON public.multiplix_delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: leitura por quem enxerga o dispatch (mesmo desenho de multiplix_recipients).
-- Escrita e 100% service_role/RPC (como as outras tabelas do modulo).
ALTER TABLE public.multiplix_delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view delivery items of accessible dispatches"
  ON public.multiplix_delivery_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_delivery_items.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

REVOKE ALL ON public.multiplix_delivery_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.multiplix_delivery_items TO authenticated;
GRANT ALL ON public.multiplix_delivery_items TO service_role;
