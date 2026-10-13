/**
 * R2-INB-059 — marcação de leitura em lote.
 *
 * Antes cada seleção de conversa saía com UM UPDATE próprio, sem agrupamento e
 * sem retry: uma rajada (deep-link, teclado, fila de notificação) fazia N
 * requisições e uma única falha de rede perdia a marcação em silêncio. Estes
 * casos são o contrato portado do Zapp Web V3 (useConversationActions.markReadFlush)
 * para a fila do RealtimeService: agrupamento de 250 ms, dedupe por Set, guarda
 * de UUID de contato, retry só do que é transitório e flush na saída.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
const JID = '5511999999999@s.whatsapp.net';

const h = vi.hoisted(() => {
  const logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };
  // Resposta de cada PATCH. Um nó "thenable" deixa a cadeia
  // update().in().eq().eq() ser aguardada sem depender do SDK.
  const responder = vi.fn((..._args: unknown[]) => Promise.resolve({ error: null }));
  const buildNode = () => {
    const node: { eq?: () => unknown; then?: unknown } = {};
    node.eq = () => node;
    node.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      responder().then(resolve, reject);
    return node;
  };
  const eq = vi.fn((_column: string, _value: unknown) => buildNode());
  const inFn = vi.fn((_column: string, _values: string[]) => ({ eq }));
  const update = vi.fn((_values: Record<string, unknown>) => ({ in: inFn }));
  const from = vi.fn((_table: string) => ({ update }));
  return { logger, responder, eq, inFn, update, from, supabase: { from } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));
vi.mock('@/lib/logger', () => ({ getLogger: () => h.logger }));

async function load() {
  vi.resetModules();
  return import('../realtime.service');
}

/** Avança o relógio e drena as microtarefas da cadeia do PATCH. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.responder.mockReset().mockImplementation(() => Promise.resolve({ error: null }));
  h.eq.mockClear();
  h.inFn.mockClear();
  h.update.mockClear();
  h.from.mockClear();
  h.logger.error.mockReset();
  h.logger.warn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeService — fila de leitura em lote', () => {
  it('1. rajada de 5 conversas → UM PATCH com os 5 ids depois de 250ms', async () => {
    const mod = await load();

    for (const id of [A, B, C, D, E]) void mod.RealtimeService.markMessagesAsRead(id);
    expect(h.from).not.toHaveBeenCalled();

    await advance(250);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ is_read: true });
    expect(h.inFn).toHaveBeenCalledTimes(1);
    expect(h.inFn.mock.calls[0][0]).toBe('contact_id');
    expect(h.inFn.mock.calls[0][1]).toEqual([A, B, C, D, E]);
    // Mensagem do agente não é marcada como lida.
    expect(h.eq.mock.calls[0][0]).toBe('sender');
  });

  it('2. união de chamadas na mesma janela → 1 PATCH sem duplicar id', async () => {
    const mod = await load();

    void mod.RealtimeService.markMessagesAsRead(A);
    mod.RealtimeService.markManyMessagesAsRead([B]);
    mod.RealtimeService.markManyMessagesAsRead([A, C]);

    await advance(250);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.inFn.mock.calls[0][1]).toEqual([A, B, C]);
  });

  it('3. mesma conversa marcada 2x → id único no PATCH (Set dedupe)', async () => {
    const mod = await load();

    void mod.RealtimeService.markMessagesAsRead(A);
    void mod.RealtimeService.markMessagesAsRead(A);

    await advance(250);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.inFn.mock.calls[0][1]).toEqual([A]);
  });

  it('4. chamadas espaçadas >250ms → PATCH separados (a fila esvazia a cada flush)', async () => {
    const mod = await load();

    void mod.RealtimeService.markMessagesAsRead(A);
    await advance(250);
    expect(h.update).toHaveBeenCalledTimes(1);

    void mod.RealtimeService.markMessagesAsRead(B);
    await advance(250);
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(h.inFn.mock.calls[1][1]).toEqual([B]);
  });

  it('5. markManyMessagesAsRead([]) → no-op: zero PATCH e nenhum timer pendente', async () => {
    const mod = await load();

    mod.RealtimeService.markManyMessagesAsRead([]);
    await advance(500);

    expect(h.from).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('6. guarda UUID: JID descartado sem PATCH, e o JID não vai para o log', async () => {
    const mod = await load();

    void mod.RealtimeService.markMessagesAsRead(JID);
    mod.RealtimeService.markManyMessagesAsRead([JID, A]);

    await advance(250);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.inFn.mock.calls[0][1]).toEqual([A]);
    expect(h.logger.warn).toHaveBeenCalled();
    // Nunca logar o valor descartado: pode ser telefone/JID de contato real.
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(JID);
  });

  it('7. flush na saída (unmount/pagehide): o PATCH sai já, sem esperar a janela', async () => {
    const mod = await load();

    void mod.RealtimeService.markMessagesAsRead(A);
    expect(h.from).not.toHaveBeenCalled();

    await mod.flushPendingMarkRead(false);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.inFn.mock.calls[0][1]).toEqual([A]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('8. erro permanente (403) → log e nenhuma re-tentativa', async () => {
    const mod = await load();
    h.responder.mockImplementation(() => Promise.resolve({ error: { status: 403, message: 'permission denied' } }));

    void mod.RealtimeService.markMessagesAsRead(A);
    await advance(250);
    expect(h.update).toHaveBeenCalledTimes(1);

    await advance(60_000);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('is permanent'),
      expect.anything()
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('9. erro transitório (rede) → ids voltam e retry com backoff até passar', async () => {
    const mod = await load();
    h.responder
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementation(() => Promise.resolve({ error: null }));

    void mod.RealtimeService.markMessagesAsRead(A);
    await advance(250);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ids kept for retry'),
      expect.anything()
    );

    // Backoff base de 1s: o mesmo id volta no PATCH seguinte.
    await advance(1_000);
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(h.inFn.mock.calls[1][1]).toEqual([A]);

    // Sucesso zera o contador: nada mais pendente.
    await advance(60_000);
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('10. erro genérico (contrato) → log com o motivo e sem retry', async () => {
    const mod = await load();
    h.responder.mockImplementation(() => Promise.resolve({ error: { message: 'boom' } }));

    void mod.RealtimeService.markMessagesAsRead(A);
    await advance(250);

    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error marking messages as read'),
      { message: 'boom' }
    );

    await advance(60_000);
    expect(h.update).toHaveBeenCalledTimes(1);
  });
});
