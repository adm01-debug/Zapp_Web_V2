/**
 * Retomar sem esperar o lote: `confirmResumeByStatus` decide pelo PRIMEIRO
 * resultado — transicao de status no servidor, recusa do worker ou prazo — e
 * nunca produz um segundo resultado (um toast so na tela).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmResumeByStatus, RESUME_CONFIRM_TIMEOUT_MS, RESUME_POLL_INTERVAL_MS,
} from '@/hooks/integrations/multiplixResume';
import { MultiplixSendError, multiplixActionErrorText } from '@/hooks/integrations/multiplixActionErrors';

/** Pedido ao worker controlado pelo teste (o worker real leva minutos). */
function deferred() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('confirmResumeByStatus', () => {
  it('worker LENTO: a transicao paused -> sending confirma a retomada sem esperar o lote', async () => {
    const worker = deferred();
    let status = 'paused';
    const readStatus = vi.fn(async () => status);
    const outcome = confirmResumeByStatus({ request: worker.promise, readStatus });

    await vi.advanceTimersByTimeAsync(RESUME_POLL_INTERVAL_MS);
    expect(readStatus).toHaveBeenCalledTimes(1);
    status = 'sending';
    await vi.advanceTimersByTimeAsync(RESUME_POLL_INTERVAL_MS);

    await expect(outcome).resolves.toEqual({ kind: 'resumed' });
    // O worker ainda nao respondeu (lote de minutos) — e nao precisou.
    expect(readStatus).toHaveBeenCalledTimes(2);
  });

  it('status muda ENQUANTO o pedido esta pendente: um resultado so, e a falha tardia do gateway nao vira segundo resultado', async () => {
    const worker = deferred();
    const onLateError = vi.fn();
    const outcome = confirmResumeByStatus({
      request: worker.promise,
      readStatus: async () => 'sending',
      onLateError,
    });

    await vi.advanceTimersByTimeAsync(RESUME_POLL_INTERVAL_MS);
    await expect(outcome).resolves.toEqual({ kind: 'resumed' });

    // ~150 s depois o gateway corta a requisicao com o envio andando.
    const cut = new MultiplixSendError('EDGE_ERROR_UNKNOWN', 'Gateway Timeout', 504);
    worker.reject(cut);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLateError).toHaveBeenCalledWith(cut);
  });

  it('recusa imediata do worker vira `rejected` com o erro (antes de qualquer transicao)', async () => {
    const refusal = new MultiplixSendError('multiplix_dispatch_already_running', 'multiplix_dispatch_already_running', 409);
    const readStatus = vi.fn(async () => 'paused');
    const outcome = confirmResumeByStatus({ request: Promise.reject(refusal), readStatus });

    await expect(outcome).resolves.toEqual({ kind: 'rejected', error: refusal });
    expect(readStatus).not.toHaveBeenCalled();
  });

  it('worker que responde rapido (lote pequeno) conta como retomado', async () => {
    const outcome = confirmResumeByStatus({ request: Promise.resolve({ ok: true }), readStatus: async () => 'paused' });
    await expect(outcome).resolves.toEqual({ kind: 'resumed' });
  });

  it('prazo esgotado sem transicao nem recusa = `pending` (limitado, nao espera o lote)', async () => {
    const worker = deferred();
    const readStatus = vi.fn(async () => 'paused');
    const outcome = confirmResumeByStatus({ request: worker.promise, readStatus });

    await vi.advanceTimersByTimeAsync(RESUME_CONFIRM_TIMEOUT_MS);
    await expect(outcome).resolves.toEqual({ kind: 'pending' });
    const reads = readStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(RESUME_CONFIRM_TIMEOUT_MS);
    // Depois do resultado o polling para.
    expect(readStatus.mock.calls.length).toBe(reads);
  });

  it('leitura de status que falha (rede) nao derruba a espera', async () => {
    const worker = deferred();
    const readStatus = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue('sending');
    const outcome = confirmResumeByStatus({ request: worker.promise, readStatus });

    await vi.advanceTimersByTimeAsync(RESUME_POLL_INTERVAL_MS * 2);
    await expect(outcome).resolves.toEqual({ kind: 'resumed' });
  });
});

describe('multiplixActionErrorText — erro das acoes em PT-BR, nunca o codigo cru', () => {
  const FALLBACK = 'Não foi possível retomar o disparo agora. Tente de novo em instantes.';
  const casos: Array<[string, RegExp]> = [
    ['multiplix_dispatch_already_running', /já está enviando/],
    ['multiplix_dispatch_confirm_required', /Iniciar.*confirme/],
    ['multiplix_dispatch_start_denied_from_cancelled', /não pode ser iniciado/],
    ['multiplix_dispatch_pause_denied_from_paused', /Só é possível pausar/],
    ['multiplix_dispatch_cancel_denied_from_completed', /já foi encerrado/],
    ['multiplix_dispatch_message_required', /sem mensagem/],
    ['multiplix_dispatch_recipients_required', /sem destinatários/],
    ['multiplix_confirm_no_blocks', /bloco de mensagem/],
    ['multiplix_outside_window', /janela de envio/],
    ['WhatsApp connection lost: dispatch paused', /conexão do WhatsApp/],
    ['Forbidden', /permissão/],
    ['EDGE_ERROR_NETWORK', /Sem conexão com o servidor/],
  ];

  it.each(casos)('%s -> frase amigavel', (code, frase) => {
    const text = multiplixActionErrorText(new MultiplixSendError(code), FALLBACK);
    expect(text).toMatch(frase);
    expect(text).not.toContain(code);
  });

  it.each(['55000', 'transition_failed', 'EDGE_ERROR_UNKNOWN', 'multiplix_codigo_novo'])(
    'codigo desconhecido (%s) cai no texto padrao, sem vazar o codigo',
    (code) => {
      expect(multiplixActionErrorText(new MultiplixSendError(code, 'detalhe tecnico'), FALLBACK)).toBe(FALLBACK);
    },
  );

  it('erro sem codigo (ex.: rejeicao crua do SDK) usa o texto padrao, nunca a mensagem tecnica', () => {
    expect(multiplixActionErrorText(new Error('Edge Function returned a non-2xx status code'), FALLBACK)).toBe(FALLBACK);
    expect(multiplixActionErrorText(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
