/**
 * SL-198 (itens 061-062 do inventário de paridade) — o CÁLCULO da linha do tempo de envio por
 * mensagem e do resumo de fila/falhas da conversa. Os componentes que desenham isso estão em
 * `MessageSendHistorySheet.tsx`; o cálculo mora aqui porque a regra da casa
 * (`react-refresh/only-export-components`, contada pelo lint-ratchet) não deixa um arquivo
 * exportar componente E função pura — os vizinhos `calls/periodos.ts` e `tasks/board/resolveDragEnd.ts`
 * seguem o mesmo corte.
 *
 * A lacuna medida no código atual: `MessageStatus.tsx` e o `MessageStatusIcon`
 * (`chat/messageUtils.tsx`) mostram só o ÚLTIMO estado; não existia `MessageAttemptsTimeline`
 * nem `MessageSendHistorySheet`, então "quantas tentativas" e "quando" não tinham onde aparecer.
 *
 * Toda a linha do tempo sai de colunas que JÁ existem em `public.messages` — nenhuma coluna,
 * migration, Edge Function ou dependência nova. As colunas e quem as escreve
 * (`supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql`):
 *   created_at .................... `enqueue_outbound_message` cria a mensagem já com status
 *                                   'sending' (é o instante em que ela entra na fila).
 *   delivery_attempt_count ........ `claim_outbound_message` soma 1 a cada tentativa do worker;
 *                                   `complete_outbound_message`/`fail_outbound_message` preservam.
 *   delivery_claimed_at ........... início da tentativa EM VOO (o claim grava; complete/fail zeram).
 *   delivery_claim_expires_at ..... até quando o lease da tentativa em voo vale.
 *   delivery_last_claim_token ..... não-nulo = a última tentativa já foi fechada pelo worker.
 *   status / status_updated_at .... estado atual ('sending' | 'sent' | 'delivered' | 'read' |
 *                                   'failed') e quando ele mudou.
 *   Uma falha RECUPERÁVEL (`fail_outbound_message(p_retryable => true)`) devolve a mensagem para
 *   'sending' com o token da tentativa fechada — é isso que a timeline chama de "reposta na fila".
 *
 * O que este cálculo NÃO mostra, porque NÃO existe no schema atual: o erro do provedor por
 * tentativa. Isso é a lista por tentativa do item 029 — tabela `message_attempts` gravada pela
 * Edge de envio (`docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md`, linha 533) —
 * dependência externa a este cartão (aqui não entra DDL nem Edge Function), registrada no relato.
 */
import { format } from 'date-fns';

/** Só as colunas que a timeline lê — aceita `Message` inteiro ou um recorte vindo do banco. */
export interface MessageSendFields {
  sender?: string | null;
  created_at?: string | null;
  status?: string | null;
  status_updated_at?: string | null;
  delivery_attempt_count?: number | null;
  delivery_claimed_at?: string | null;
  delivery_claim_expires_at?: string | null;
  delivery_last_claim_token?: string | null;
}

export type SendTimelineState = 'done' | 'current' | 'pending' | 'error';

export interface SendTimelineStep {
  key: 'queued' | 'attempt' | 'result';
  label: string;
  /** ISO do banco, ou `null` quando o registro não guarda aquele horário. Nunca inventado. */
  at: string | null;
  state: SendTimelineState;
  detail?: string;
}

export interface DeliveryProgress {
  /** Mensagens do agente consideradas (as do contato não têm envio para acompanhar). */
  total: number;
  queued: number;
  inFlight: number;
  failed: number;
  confirmed: number;
}

const STATUS_FINAL: Record<string, string> = {
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
};

function isoTexte(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/** Marca textual do banco (ex.: uuid do claim) — não é data, só precisa estar preenchida. */
function marcado(value?: string | null): boolean {
  return typeof value === 'string' && value.length > 0;
}

function tentativas(n: number): string {
  return `${n} tentativ${n === 1 ? 'a' : 'as'}`;
}

/**
 * A linha do tempo de envio da mensagem, passo a passo, do que a LINHA tem.
 * Mensagem recebida (não é do agente) não tem envio para acompanhar: devolve `[]`.
 */
export function buildMessageSendTimeline(message: MessageSendFields): SendTimelineStep[] {
  if (message.sender !== 'agent') return [];

  const attempts = Math.max(0, Math.trunc(message.delivery_attempt_count ?? 0));
  const status = message.status ?? 'sending';
  const emVoo = isoTexte(message.delivery_claimed_at) !== null;
  const tentativaFechada = marcado(message.delivery_last_claim_token);

  const steps: SendTimelineStep[] = [
    { key: 'queued', label: 'Enfileirada', at: isoTexte(message.created_at), state: 'done' },
  ];

  if (emVoo) {
    const limite = isoTexte(message.delivery_claim_expires_at);
    steps.push({
      key: 'attempt',
      label: `Tentativa ${attempts} em andamento`,
      at: isoTexte(message.delivery_claimed_at),
      state: 'current',
      ...(limite ? { detail: `lease até ${format(new Date(limite), 'HH:mm:ss')}` } : {}),
    });
  } else if (status === 'sending' && attempts > 0) {
    steps.push({
      key: 'attempt',
      label: tentativaFechada
        ? `Tentativa ${attempts} falhou e foi reposta na fila`
        : `Tentativa ${attempts} encerrada; aguardando nova tentativa`,
      at: null,
      state: 'current',
    });
  } else if (attempts > 0) {
    steps.push({
      key: 'attempt',
      label: attempts === 1 ? 'Tentativa 1 de envio' : `Tentativas 1 a ${attempts} de envio`,
      at: null,
      state: 'done',
      detail: tentativas(attempts),
    });
  } else {
    steps.push({
      key: 'attempt',
      label: 'Aguardando o worker de entrega',
      at: null,
      state: status === 'sending' ? 'current' : 'pending',
    });
  }

  const confirmado = STATUS_FINAL[status];
  if (status === 'failed') {
    steps.push({
      key: 'result',
      label: 'Falha no envio',
      at: isoTexte(message.status_updated_at),
      state: 'error',
      ...(attempts > 0 ? { detail: tentativas(attempts) } : {}),
    });
  } else if (confirmado) {
    steps.push({
      key: 'result',
      label: confirmado,
      at: isoTexte(message.status_updated_at),
      state: 'done',
    });
  } else {
    steps.push({
      key: 'result',
      label: emVoo ? 'Aguardando confirmação de entrega' : 'Na fila de entrega',
      at: null,
      state: 'current',
    });
  }

  return steps;
}

/** Resumo da conversa para a barra de falhas/progresso (item 062, metade de cliente). */
export function summarizeDeliveryProgress(messages: readonly MessageSendFields[]): DeliveryProgress {
  const progress: DeliveryProgress = { total: 0, queued: 0, inFlight: 0, failed: 0, confirmed: 0 };

  for (const message of messages) {
    if (message.sender !== 'agent') continue;
    progress.total += 1;

    const status = message.status ?? 'sending';
    if (status === 'failed') {
      progress.failed += 1;
    } else if (STATUS_FINAL[status]) {
      progress.confirmed += 1;
    } else if (isoTexte(message.delivery_claimed_at) !== null) {
      progress.inFlight += 1;
    } else {
      progress.queued += 1;
    }
  }

  return progress;
}
