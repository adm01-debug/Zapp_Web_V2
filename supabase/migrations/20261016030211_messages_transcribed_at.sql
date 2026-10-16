-- messages_transcribed_at
-- Rollback: remove o gatilho e a função do carimbo e apaga a coluna transcribed_at (o carimbo é dado novo; nenhuma coluna existente muda, e o backfill só copiou o updated_at que a linha já tinha, então nada de valor se perde).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_messages_stamp_transcribed_at on public.messages;
--   drop function if exists public.stamp_message_transcribed_at();
--   alter table public.messages drop column if exists transcribed_at;
--
-- HZ3-007 (auditoria paridade doc 26, achados_3; cartão t_eddb4b16). O hook
-- src/hooks/communication/useTranscriptionNotifications.ts só evita aviso duplicado
-- porque public.messages está com REPLICA IDENTITY FULL: a guarda
-- `old.transcription_status !== 'completed'` precisa de payload.old completo. Quando
-- o FULL sair (SL-104 / docs/audits/slow-queries-2026-09.md — o UPDATE de "marcar
-- como lido" custa 551 ms), payload.old passa a trazer só o id e QUALQUER UPDATE
-- posterior de uma mensagem já transcrita (status de entrega, edição) volta a
-- disparar o aviso. O carimbo transcribed_at tira essa dependência do hook: a
-- transição para 'completed' grava a hora UMA vez no próprio banco, e o hook passa a
-- avisar por created_at/transcribed_at recente, sem depender do payload.old.
--
-- Só ADITIVO: coluna nova NULL (sem default, sem rewrite das linhas existentes),
-- gatilho BEFORE UPDATE e backfill do histórico recente. Nenhuma coluna, policy,
-- índice, GRANT ou papel existente é alterado; a Edge e os hooks não são tocados.

-- ---------------------------------------------------------------------------
-- 1) Coluna. NULL = "nunca transcrita"; o carimbo só aparece com o gatilho abaixo.
--    ADD COLUMN nullable sem DEFAULT: no Postgres 17 é mudança de catálogo, a
--    tabela não é reescrita (as linhas existentes leem NULL sem custo).
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Carimbo. Quando a linha passa a 'completed' e ainda não tem carimbo, grava
--    now() na MESMA transação do UPDATE (nada de relógio do navegador). Idempotente:
--    se transcribed_at já está preenchido, nada é sobrescrito — o UPDATE posterior
--    de entrega/leitura/edição não mexe no carimbo. BEFORE UPDATE, e não INSERT:
--    os dois escritores da transcrição (supabase/functions/ai-transcribe-audio e
--    supabase/functions/_shared/evolution-webhook-messages.ts) criam a mensagem
--    antes e depois fazem UPDATE (... 'processing' -> 'completed'/'failed').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_message_transcribed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.transcription_status = 'completed' AND NEW.transcribed_at IS NULL THEN
    NEW.transcribed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Função de gatilho: ninguém precisa de EXECUTE (o gatilho não checa privilégio).
-- Nada de anon/authenticated; nada de novo para quem já escreve messages.
REVOKE ALL ON FUNCTION public.stamp_message_transcribed_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_messages_stamp_transcribed_at ON public.messages;
CREATE TRIGGER trg_messages_stamp_transcribed_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.stamp_message_transcribed_at();

-- ---------------------------------------------------------------------------
-- 3) Backfill do histórico recente, em LOTE. Sem o carimbo, as mensagens que já
--    estavam 'completed' ficariam marcadas como "transcrição nova" na virada — e o
--    carimbo para elas é o updated_at que a linha já tinha (sozinho, jamais now()).
--    Janela de 30 dias: é o que o aviso de transcrição cobre na tela; carimbo mais
--    antigo que isso nunca vira aviso. Lotes de 500 para o UPDATE não tomar o
--    ACCESS EXCLUSIVE da tabela por tempo indeterminado num histórico grande (a
--    migration já paga esse lock no ADD COLUMN acima, então o lote roda dentro do
--    mesmo bloqueio — e não abre um segundo, o que travaria leituras de novo).
--    O gatilho de updated_at fica desligado SÓ durante o backfill: sem isso, o
--    UPDATE diria que as mensagens antigas "mudaram agora" (updated_at = now()) e a
--    data real do registro se perderia. Ele é religado no fim — e também se algo
--    falhar no meio, para o gatilho não ficar desligado fora desta transação.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_lote  integer := 500;
  v_ids   uuid[];
  v_n     integer;
  v_total integer := 0;
BEGIN
  -- Base nova/sem histórico a carimbar (inclusive banco local vazio): sai antes de
  -- qualquer ALTER TABLE e não mexe em nada.
  IF NOT EXISTS (
    SELECT 1
      FROM public.messages
     WHERE transcribed_at IS NULL
       AND transcription_status = 'completed'
       AND created_at >= now() - interval '30 days'
  ) THEN
    RAISE NOTICE 'messages_transcribed_at: backfill sem nada a carimbar (nenhuma mensagem completed sem carimbo nos ultimos 30 dias)';
    RETURN;
  END IF;

  ALTER TABLE public.messages DISABLE TRIGGER update_messages_updated_at;

  LOOP
    SELECT array_agg(id) INTO v_ids
      FROM (
        SELECT id
          FROM public.messages
         WHERE transcribed_at IS NULL
           AND transcription_status = 'completed'
           AND created_at >= now() - interval '30 days'
         ORDER BY created_at DESC
         LIMIT v_lote
      ) AS alvo;

    EXIT WHEN v_ids IS NULL;

    UPDATE public.messages
       SET transcribed_at = COALESCE(updated_at, created_at)
     WHERE id = ANY (v_ids)
       AND transcribed_at IS NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  ALTER TABLE public.messages ENABLE TRIGGER update_messages_updated_at;
  RAISE NOTICE 'messages_transcribed_at: backfill carimbou % mensagem(ns)', v_total;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.messages ENABLE TRIGGER update_messages_updated_at;
  RAISE;
END;
$backfill$;
