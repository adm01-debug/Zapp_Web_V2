/**
 * Retomar um disparo PAUSADO (um clique, regras.md §8) sem esperar o lote.
 *
 * O worker `multiplix-send` so responde DEPOIS de processar um lote inteiro
 * (atraso de digitacao + intervalo por destinatario: minutos). Esperar a resposta
 * fazia o "Disparo retomado" aparecer minutos depois — ou um falso erro quando o
 * gateway corta a requisicao (~150 s) com o envio andando. Mesma ideia do
 * composer: o pedido sai, a tela NAO espera o lote; a retomada e confirmada pela
 * TRANSICAO de status (paused -> sending) lida do servidor, com espera limitada.
 *
 * Resultado (o primeiro que acontecer, um so):
 *   - `resumed`  — o status saiu de 'paused' para sending/concluido, ou o worker
 *                  respondeu sucesso antes disso;
 *   - `rejected` — o worker recusou (409/403/rede) antes da transicao;
 *   - `pending`  — o prazo acabou sem transicao nem recusa (o pedido segue no
 *                  servidor; a tela atualiza sozinha pelo realtime/polling).
 * Depois do resultado, uma falha tardia do pedido (ex.: corte do gateway com o
 * envio andando) e so registrada — nunca vira um segundo toast.
 */

/** Status que provam que a retomada aconteceu (o disparo pode concluir rapido). */
const RESUMED_STATUSES = new Set(['sending', 'completed', 'completed_with_failures']);

/** Prazo maximo para a transicao aparecer (o pedido continua depois dele). */
export const RESUME_CONFIRM_TIMEOUT_MS = 15_000;
/** Intervalo entre leituras do status enquanto espera. */
export const RESUME_POLL_INTERVAL_MS = 1_500;

export type ResumeOutcome =
  | { kind: 'resumed' }
  | { kind: 'rejected'; error: unknown }
  | { kind: 'pending' };

export interface ConfirmResumeOptions {
  /** Pedido ao worker JA disparado (nao e aguardado ate o fim). */
  request: Promise<unknown>;
  /** Le o status atual do disparo no servidor; falha de leitura e ignorada. */
  readStatus: () => Promise<string | null | undefined>;
  timeoutMs?: number;
  intervalMs?: number;
  /** Falha do pedido que chega DEPOIS do resultado (so para log). */
  onLateError?: (error: unknown) => void;
}

export function confirmResumeByStatus({
  request,
  readStatus,
  timeoutMs = RESUME_CONFIRM_TIMEOUT_MS,
  intervalMs = RESUME_POLL_INTERVAL_MS,
  onLateError,
}: ConfirmResumeOptions): Promise<ResumeOutcome> {
  return new Promise<ResumeOutcome>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: ResumeOutcome) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (deadline) clearTimeout(deadline);
      resolve(outcome);
    };

    request.then(
      () => finish({ kind: 'resumed' }),
      (error: unknown) => {
        if (settled) {
          onLateError?.(error);
          return;
        }
        finish({ kind: 'rejected', error });
      },
    );

    const poll = async () => {
      if (settled) return;
      try {
        const status = await readStatus();
        if (status && RESUMED_STATUSES.has(status)) {
          finish({ kind: 'resumed' });
          return;
        }
      } catch {
        // Leitura falhou (rede): a proxima tentativa ou o prazo decidem.
      }
      if (!settled) pollTimer = setTimeout(() => { void poll(); }, intervalMs);
    };

    deadline = setTimeout(() => finish({ kind: 'pending' }), timeoutMs);
    pollTimer = setTimeout(() => { void poll(); }, intervalMs);
  });
}
