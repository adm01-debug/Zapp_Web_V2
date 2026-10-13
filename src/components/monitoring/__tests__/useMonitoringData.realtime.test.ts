/**
 * Cartão t_4884e0d6 — "Assinatura ao vivo de mensagens para o painel".
 *
 * O painel de monitoramento só se atualizava no ciclo de 30 s do polling (o único
 * canal realtime inscrito era `whatsapp_connections`): mensagem nova/mudada
 * ficava invisível até o próximo ciclo. Estes testes rodam o hook REAL com o
 * cliente Supabase mockado e conferem:
 *  1. a inscrição em `public.messages` num tópico ÚNICO (`monitoring-messages`);
 *  2. que um evento realtime relê o painel NA HORA, sem avançar os 30 s;
 *  3. que a releitura ao vivo mantém a JANELA que a tela mostra (não cai no
 *     default '12h' da assinatura);
 *  4. que uma rajada de mensagens cabe em UMA releitura imediata + uma no fim da
 *     janela (throttle), nunca uma consulta por mensagem;
 *  5. que a reconexão (SUBSCRIBED após queda) ressincroniza o painel;
 *  6. que uma resposta atrasada de releitura antiga NÃO sobrescreve a mais nova;
 *  7. que desmontar o painel devolve o tópico (removeChannel), sem canal preso.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RealtimeChannel } from '@supabase/supabase-js';

type RpcCall = { name: string; args: Record<string, string> };
type RpcOut = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpcCalls: [] as RpcCall[],
  rpcResult: null as null | (() => RpcOut),
  rpcDeferred: null as null | Array<{ resolve: (value: unknown) => void }>,
  tables: [] as string[],
  channelCalls: [] as Array<{ topic: string; config: unknown }>,
  bindings: [] as unknown[],
  payloadHandler: null as null | ((payload: unknown) => void),
  statusHandler: null as null | ((status: string, error?: unknown) => void),
  removed: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  // Builder thenable: aceita .select().gte().order().limit() e o `await` direto.
  function query(result: unknown) {
    const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
    for (const m of ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit']) {
      p[m] = vi.fn(() => p);
    }
    return p;
  }

  function channel(topic: string, config?: unknown) {
    h.channelCalls.push({ topic, config });
    const ch = {
      on: vi.fn((_event: string, binding: unknown, handler: (payload: unknown) => void) => {
        h.bindings.push(binding);
        h.payloadHandler = handler;
        return ch;
      }),
      subscribe: vi.fn((cb?: (status: string, error?: unknown) => void) => {
        h.statusHandler = cb ?? null;
        return ch;
      }),
      unsubscribe: vi.fn(),
    };
    return ch as unknown as RealtimeChannel;
  }

  return {
    supabase: {
      from: (table: string) => {
        h.tables.push(table);
        return query({ data: [], error: null });
      },
      rpc: (name: string, args: Record<string, string>) => {
        h.rpcCalls.push({ name, args });
        if (h.rpcDeferred) return new Promise((resolve) => h.rpcDeferred!.push({ resolve }));
        return Promise.resolve(h.rpcResult ? h.rpcResult() : { data: [], error: null });
      },
      channel,
      removeChannel: (ch: unknown) => {
        h.removed.push(ch);
        return Promise.resolve('ok');
      },
    },
  };
});

// O hook é reimportado por teste para que a tabela global de canais compartilhados
// (module scope do wrapper) nasça limpa em cada cenário.
let useMonitoringData: typeof import('@/components/monitoring/hooks/useMonitoringData')['useMonitoringData'];

const NOW = new Date('2026-10-06T17:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const fireMessage = (id = 'm1') => ({
  eventType: 'INSERT',
  table: 'messages',
  schema: 'public',
  commit_timestamp: new Date().toISOString(),
  new: { id },
  old: {},
});

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.rpcCalls = [];
  h.rpcResult = null;
  h.rpcDeferred = null;
  h.tables = [];
  h.channelCalls = [];
  h.bindings = [];
  h.payloadHandler = null;
  h.statusHandler = null;
  h.removed = [];
  ({ useMonitoringData } = await import('@/components/monitoring/hooks/useMonitoringData'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMonitoringData — assinatura ao vivo de mensagens', () => {
  it('assina public.messages num tópico único e sem filtro', () => {
    renderHook(() => useMonitoringData());

    expect(h.channelCalls).toHaveLength(1);
    expect(h.channelCalls[0].topic).toBe('zapp:monitoring-messages:public:messages:*');
    expect(h.bindings).toEqual([{ event: '*', schema: 'public', table: 'messages' }]);
  });

  it('mensagem nova relê o painel na hora, sem esperar os 30 s', async () => {
    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('24h'); });
    expect(h.rpcCalls).toHaveLength(2);

    await act(async () => { h.payloadHandler?.(fireMessage()); });

    // Duas novas chamadas à RPC (gráfico + sparkline) — e nenhum timer de 30 s rodou.
    expect(h.rpcCalls).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a releitura ao vivo mantém a janela da tela, não o default de 12h', async () => {
    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('24h'); });
    const first = h.rpcCalls.slice(0, 2);
    expect(first).toHaveLength(2);
    // sparklines usam a janela deslizante exata do período.
    expect(Date.parse(first[1].args.p_to) - Date.parse(first[1].args.p_from)).toBe(24 * HOUR);

    await act(async () => { h.payloadHandler?.(fireMessage()); });

    const live = h.rpcCalls.slice(2);
    expect(live).toHaveLength(2);
    live.forEach((call, i) => {
      expect(call.name).toBe('get_monitoring_message_buckets');
      // A releitura ao vivo pede EXATAMENTE a mesma janela da leitura da tela;
      // se tivesse caído no default de '12h' as datas mudariam.
      expect(call.args).toEqual(first[i].args);
      expect(Date.parse(call.args.p_to) - Date.parse(call.args.p_from)).not.toBe(12 * HOUR);
    });
  });

  it('rajada de mensagens cabe em uma releitura imediata + uma no fim da janela', async () => {
    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('12h'); });
    expect(h.rpcCalls).toHaveLength(2);

    await act(async () => {
      for (let i = 0; i < 20; i += 1) h.payloadHandler?.(fireMessage(`m${i}`));
    });

    // 20 eventos -> 2 chamadas (uma releitura), não 40.
    expect(h.rpcCalls).toHaveLength(4);

    // O que sobrou da rajada é agrupado: uma releitura final no fim da janela.
    await act(async () => { vi.advanceTimersByTime(4_000); });
    expect(h.rpcCalls).toHaveLength(6);

    // Depois disso o painel volta a ficar quieto até a próxima mensagem.
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(h.rpcCalls).toHaveLength(6);
  });

  it('reconexão (SUBSCRIBED após queda) ressincroniza o painel', async () => {
    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('12h'); });
    expect(h.rpcCalls).toHaveLength(2);

    await act(async () => { h.statusHandler?.('CHANNEL_ERROR'); });
    expect(h.rpcCalls).toHaveLength(2);

    await act(async () => { h.statusHandler?.('SUBSCRIBED'); });
    expect(h.rpcCalls).toHaveLength(4);
  });

  it('resposta atrasada de uma releitura antiga não sobrescreve a mais nova', async () => {
    h.rpcDeferred = [];
    const { result } = renderHook(() => useMonitoringData());

    // Leitura A (24h) fica pendente; a chegada ao vivo dispara a leitura B.
    act(() => { void result.current.fetchData('24h'); });
    await act(async () => { h.payloadHandler?.(fireMessage()); });

    const [, , bGraph, bSpark] = h.rpcDeferred;
    await act(async () => {
      bGraph.resolve({ data: [{ bucket_start: NOW.toISOString(), incoming: 7, outgoing: 3 }], error: null });
      bSpark.resolve({ data: [], error: null });
    });
    expect(result.current.messageStats.incoming).toBe(7);

    // A leitura A (antiga) só chega agora: precisa ser descartada.
    const [aGraph, aSpark] = h.rpcDeferred;
    await act(async () => {
      aGraph.resolve({ data: [{ bucket_start: NOW.toISOString(), incoming: 999, outgoing: 999 }], error: null });
      aSpark.resolve({ data: [], error: null });
    });
    expect(result.current.messageStats.incoming).toBe(7);
  });

  it('desmontar devolve o tópico (removeChannel), sem canal preso', async () => {
    const { unmount } = renderHook(() => useMonitoringData());
    expect(h.removed).toHaveLength(0);

    unmount();
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(h.removed).toHaveLength(1);
  });
});
