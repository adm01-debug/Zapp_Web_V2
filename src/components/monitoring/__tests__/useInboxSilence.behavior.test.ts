import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { InboxSilenceConnection } from '@/components/monitoring/hooks/useInboxSilence';

/**
 * Comportamento do monitor de silêncio do inbound:
 *   - leitura a cada 60 s, só com a aba visível e online (sem consulta em segundo plano);
 *   - aviso UMA vez por episódio: a conexão entra no alerta quando fica muda, não
 *     repete enquanto continuar muda, e o alerta some quando a mensagem volta a chegar;
 *   - limiar vem de `global_settings` (o valor chega pela RPC, nunca cravado no front);
 *   - falha de leitura preserva o último retrato e mostra o erro.
 */

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => h.rpc(...args) },
}));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useInboxSilence } from '@/components/monitoring/hooks/useInboxSilence';

function rpcResult(data: unknown, error: unknown = null) {
  return { abortSignal: vi.fn(async () => ({ data, error })) };
}

const row = (over: Partial<InboxSilenceConnection> = {}): InboxSilenceConnection => ({
  connection_id: 'c1',
  connection_name: 'Comercial',
  connection_status: 'connected',
  received_5m: 0,
  received_1h: 0,
  received_24h: 12,
  last_inbound_at: '2026-10-13T05:00:00.000Z',
  last_outbound_at: '2026-10-13T05:30:00.000Z',
  silence_minutes: 10,
  is_silent: false,
  top_conversations: [],
  ...over,
});

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const visible = (value: boolean) => Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'visible' : 'hidden' });

describe('useInboxSilence — monitor de inbox muda', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visible(true);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    h.rpc.mockReset();
    h.rpc.mockReturnValue(rpcResult([]));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    visible(true);
  });

  it('lê na montagem e não alerta enquanto a caixa está recebendo', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: false })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();

    expect(h.rpc).toHaveBeenCalledWith('admin_inbox_silence');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toHaveLength(1);
    expect(result.current.alerts).toEqual([]);
  });

  it('alerta a conexão que ficou muda e NÃO repete nas leituras seguintes', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: true })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();

    expect(result.current.alerts).toEqual([
      {
        connection_id: 'c1',
        connection_name: 'Comercial',
        silence_since: '2026-10-13T05:00:00.000Z',
        silence_minutes: 10,
      },
    ]);

    await flush(60_000);
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.alerts).toHaveLength(1);

    // Mesma referência: quem observa `alerts` não é avisado de novo a cada 60 s.
    const firstAlerts = result.current.alerts;
    await flush(60_000);
    expect(h.rpc).toHaveBeenCalledTimes(3);
    expect(result.current.alerts).toBe(firstAlerts);
  });

  it('o alerta some quando a mensagem volta a chegar e volta em um NOVO episódio', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: true })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();
    expect(result.current.alerts).toHaveLength(1);

    // Voltou a chegar mensagem: fim do episódio, alerta limpo.
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: false })]));
    await flush(60_000);
    expect(result.current.alerts).toEqual([]);

    // Novo episódio de silêncio: avisa de novo, com o carimbo atualizado.
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: true, last_inbound_at: '2026-10-13T07:15:00.000Z' })]));
    await flush(60_000);
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].silence_since).toBe('2026-10-13T07:15:00.000Z');
  });

  it('não consulta em segundo plano: aba escondida para de ler e a volta relê na hora', async () => {
    const { result } = renderHook(() => useInboxSilence());
    await flush();
    expect(h.rpc).toHaveBeenCalledTimes(1);

    visible(false);
    await flush(180_000);
    expect(h.rpc).toHaveBeenCalledTimes(1);

    visible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
  });

  it('o limiar vem de global_settings (pela RPC), nunca cravado no front', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ silence_minutes: 25 })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();

    expect(result.current.silenceMinutes).toBe(25);
    expect(result.current.silenceMinutes).not.toBe(10);
  });

  it('sem conexões o limiar é desconhecido (null), não um padrão inventado', async () => {
    const { result } = renderHook(() => useInboxSilence());
    await flush();

    expect(result.current.connections).toEqual([]);
    expect(result.current.silenceMinutes).toBeNull();
  });

  it('falha na leitura preserva o último retrato bom e expõe o erro, sem travar o loading', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: true })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();
    expect(result.current.alerts).toHaveLength(1);

    h.rpc.mockReturnValue(rpcResult(null, new Error('rpc indisponível')));
    await flush(60_000);

    expect(result.current.error).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toHaveLength(1);
    expect(result.current.alerts).toHaveLength(1);
  });

  it('a conexão que deixa de ser relatada encerra o alerta', async () => {
    h.rpc.mockReturnValue(rpcResult([row({ is_silent: true })]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();
    expect(result.current.alerts).toHaveLength(1);

    h.rpc.mockReturnValue(rpcResult([]));
    await flush(60_000);
    expect(result.current.alerts).toEqual([]);
  });

  it('normaliza as conversas mais ativas e linhas parciais sem quebrar', async () => {
    h.rpc.mockReturnValue(rpcResult([{
      ...row({ is_silent: true }),
      received_5m: 'indefinido',
      top_conversations: [
        { contact_id: 'ct1', contact_name: 'Ana', received: '3', last_at: '2026-10-13T06:00:00.000Z' },
        null,
        { contact_name: 'sem id' },
        'lixo',
      ],
    }]));

    const { result } = renderHook(() => useInboxSilence());
    await flush();

    expect(result.current.connections[0].received_5m).toBe(0);
    expect(result.current.connections[0].top_conversations).toEqual([
      { contact_id: 'ct1', contact_name: 'Ana', received: 3, last_at: '2026-10-13T06:00:00.000Z' },
    ]);
  });

  it('não consulta quando desabilitado', async () => {
    renderHook(() => useInboxSilence(false));
    await flush(120_000);

    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('para de consultar depois de desmontar', async () => {
    const { unmount } = renderHook(() => useInboxSilence());
    await flush();
    expect(h.rpc).toHaveBeenCalledTimes(1);

    unmount();
    await flush(180_000);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
