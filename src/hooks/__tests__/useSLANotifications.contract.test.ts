import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Contrato do payload de `conversation_sla` no canal do Realtime.
 *
 * O hook é alimentado pelo banco (payload não tipado): o teste prova que linha fora do contrato é
 * ignorada sem derrubar o handler, que `contact_id` nulo ou id que não é UUID não geram alerta, e
 * que o aviso sai com a ação "Abrir conversa".
 */
import {
  callbacks,
  dedupeCalls,
  dedupeResult,
  sonnerToast,
  resetAlertKit,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useSLANotifications, SLA_ALERT_DEDUPE_TTL_MS } from '@/hooks/sla/useSLANotifications';

const SLA_ID = '11111111-1111-4111-8111-111111111111';
const CONTATO_ID = '22222222-2222-4222-8222-222222222222';
/** O corpo mínimo que o canal entrega: os mesmos campos da tabela `conversation_sla`. */
const LINHA = {
  id: SLA_ID,
  contact_id: CONTATO_ID,
  first_message_at: '2026-10-12T12:00:00.000Z',
  first_response_at: null,
  first_response_breached: false,
  sla_configuration_id: null,
};

/** O canal registra primeiro o UPDATE; o INSERT vem depois. */
async function entregarInsert(row: unknown) {
  await callbacks[1]({ new: row, old: {} });
}
async function entregarUpdate(row: unknown, old: unknown) {
  await callbacks[0]({ new: row, old });
}

/** Deixa as promessas do handler assentarem (o canal entrega `void`). */
const assentar = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useSLANotifications — contrato do payload', () => {
  beforeEach(() => {
    resetAlertKit();
  });

  it('estouro marca o alerta de erro com a ação Abrir conversa e 10s de exibição', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    expect(dedupeCalls).toEqual([{ key: `sla-breach:${SLA_ID}`, ttlMs: SLA_ALERT_DEDUPE_TTL_MS }]);
    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = sonnerToast.error.mock.calls[0];
    expect(titulo).toContain('SLA de Primeira Resposta Violado');
    expect(opcoes.duration).toBe(10000);
    expect(opcoes.action.label).toBe('Abrir conversa');
  });

  it('estouro já marcado no INSERT também avisa (dedupe é do hook, não do clique)', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
  });

  it('estouro que já vinha marcado na linha anterior não repete o aviso', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(dedupeCalls).toEqual([]);
  });

  it('payload fora do contrato é ignorado sem alerta', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, id: 'linha-1' }); // id não é UUID
    await entregarInsert({ ...LINHA, contact_id: CONTATO_ID, first_response_at: '2026-10-12T13:00:00.000Z' });
    await entregarInsert({ ...LINHA, contact_id: CONTATO_ID, first_response_breached: undefined });
    await entregarInsert({ ...LINHA, id: undefined });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(sonnerToast.warning).not.toHaveBeenCalled();
  });

  it('linha sem contato não gera alerta (não há conversa para abrir)', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true, contact_id: null });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('contato que não é UUID é ignorado', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true, contact_id: 'c1' });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('dedupe desligado silencia o alerta repetido', async () => {
    dedupeResult.valor = false;
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('a janela do dedupe é de 24 horas', () => {
    expect(SLA_ALERT_DEDUPE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('remapear a linha (resolvida) não avisa nada', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate(
      { ...LINHA, first_response_at: '2026-10-12T12:02:00.000Z' },
      { first_response_at: null },
    );
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(sonnerToast.warning).not.toHaveBeenCalled();
  });
});

describe('useSLANotifications — aviso de risco', () => {
  beforeEach(() => {
    resetAlertKit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa ao cruzar 70% do prazo (aviso de 6s com Abrir conversa)', async () => {
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    // Sem `sla_configuration_id` vale o prazo padrão do sistema: 5min → risco em 3,5min.
    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    expect(sonnerToast.warning).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(dedupeCalls).toEqual([{ key: `sla-warning:${SLA_ID}`, ttlMs: SLA_ALERT_DEDUPE_TTL_MS }]);
    expect(sonnerToast.warning).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = sonnerToast.warning.mock.calls[0];
    expect(titulo).toContain('em Risco');
    expect(opcoes.duration).toBe(6000);
    expect(opcoes.action.label).toBe('Abrir conversa');
  });

  it('linha respondida antes do limiar desarma o aviso de risco', async () => {
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    await entregarUpdate(
      { ...LINHA, first_message_at: new Date().toISOString(), first_response_at: new Date().toISOString() },
      { first_response_at: null },
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(sonnerToast.warning).not.toHaveBeenCalled();
    expect(sonnerToast.error).not.toHaveBeenCalled();
  });
});
