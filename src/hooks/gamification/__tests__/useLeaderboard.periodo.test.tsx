/**
 * Regressão do achado DASH-REALTIME-001 (item 37 do BACKLOG_VERIFICADO) na parte
 * "descartar respostas obsoletas": `fetchLeaderboard(period)` não guarda geração nem
 * instante da requisição, então a resposta do período ANTIGO que chega depois
 * sobrescreve a do período NOVO — a tela volta para o recorte anterior.
 *
 * Contrato exigido: resposta de requisição superada (período que já não é o atual)
 * é descartada. Vermelho no código atual, verde com a correção (cartão seguinte).
 *
 * Comando local: bun run test src/hooks/gamification/__tests__/useLeaderboard.periodo.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type LinhaRpc = {
  profile_id: string;
  name: string;
  avatar: null;
  is_online: boolean;
  level: number;
  streak: number;
  achievements_count: number;
  xp: number;
  conversations_resolved: number;
  messages_handled: number;
  avg_response_time: number;
  satisfaction: number;
  rank: number;
};

function linha(profileId: string): LinhaRpc {
  return {
    profile_id: profileId,
    name: profileId,
    avatar: null,
    is_online: true,
    level: 1,
    streak: 0,
    achievements_count: 0,
    xp: 100,
    conversations_resolved: 1,
    messages_handled: 1,
    avg_response_time: 30,
    satisfaction: 5,
    rank: 1,
  };
}

/** Cada período fica pendente até o teste liberar a resposta — é assim que a corrida
 *  entre a resposta nova e a obsoleta fica determinística. */
const pendentes: Record<string, (rows: LinhaRpc[]) => void> = {};

const mockRpc = vi.fn(
  (_nome: string, params: { p_period: string }) =>
    new Promise(resolve => {
      pendentes[params.p_period] = rows => resolve({ data: rows, error: null });
    })
);

const mockFrom = vi.fn(() => {
  const builder = {
    select: () => builder,
    in: () => builder,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return builder;
});

const mockChannel = vi.fn(() => {
  const canal = {
    on: vi.fn(() => canal),
    subscribe: vi.fn(() => canal),
  };
  return canal;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, params: { p_period: string }) => mockRpc(nome, params),
    from: () => mockFrom(),
    channel: () => mockChannel(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/realtimeTopic', () => ({ uniqueRealtimeTopic: (base: string) => `${base}:teste` }));

import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  for (const chave of Object.keys(pendentes)) delete pendentes[chave];
  mockRpc.mockClear();
  mockFrom.mockClear();
  mockChannel.mockClear();
});

describe('useLeaderboard — resposta obsoleta por período', () => {
  it('descarta a resposta do período antigo que chega depois da nova', async () => {
    const { result } = renderHook(() => useLeaderboard());
    await flush(); // dispara o fetch do período padrão ('week')

    expect(typeof pendentes.week).toBe('function');

    act(() => result.current.setTimeRange('month'));
    await flush();

    expect(typeof pendentes.month).toBe('function');

    // o período NOVO (mês) responde primeiro...
    await act(async () => pendentes.month([linha('mes')]));
    await flush();
    expect(result.current.agents.map(a => a.id)).toEqual(['mes']);

    // ...e a resposta OBSOLETA (semana) chega depois: não pode voltar com a tela
    await act(async () => pendentes.week([linha('semana')]));
    await flush();
    expect(result.current.agents.map(a => a.id)).toEqual(['mes']);
  });
});
