import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor, screen } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '@/components/alerts/EvolutionDisconnectBanner';
import { queryClient } from '@/lib/queryClient';
import {
  CONNECTIONS_LIST_COLUMNS,
  invalidateConnectionsList,
  loadConnectionsList,
} from '../useConnectionsList';

/**
 * Camada de leitura unica de `whatsapp_connections`.
 *
 * Antes cada tela montava a propria consulta (faixa de desconexão, nova
 * conversa, status do WhatsApp): duas telas montadas = duas idas ao banco pela
 * MESMA tabela. Aqui provamos (1) o cache de 30s numa unica entrada
 * `['connections']`, (2) que a invalidação (realtime) derruba esse cache e
 * (3) que o SELECT pede colunas explícitas, sem os segredos da tabela.
 */
const h = vi.hoisted(() => ({
  consultas: 0,
  colunasPedidas: [] as string[],
  handlers: [] as ((payload: unknown) => void)[],
  linhas: [] as Record<string, unknown>[],
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/integrations/supabase/client', () => {
  const canal = {
    on: (_evento: string, _cfg: unknown, handler: (payload: unknown) => void) => {
      h.handlers.push(handler);
      return canal;
    },
    subscribe: () => canal,
    unsubscribe: () => canal,
  };

  return {
    supabase: {
      from: (tabela: string) => ({
        select: (colunas: string) => {
          if (tabela === 'whatsapp_connections') {
            // conta a IDA ao banco, não a montagem da query
            h.consultas += 1;
            h.colunasPedidas.push(colunas);
          }
          const corrente: Record<string, unknown> = {};
          corrente.eq = () => corrente;
          corrente.limit = () => corrente;
          corrente.order = () => corrente;
          corrente.maybeSingle = async () => ({ data: null, error: null });
          corrente.then = (cb: (v: unknown) => void) =>
            cb({ data: tabela === 'whatsapp_connections' ? h.linhas : [], error: null });
          return corrente;
        },
      }),
      channel: () => canal,
      removeChannel: vi.fn(),
      functions: { invoke: async () => ({ data: [], error: null }) },
    },
  };
});

const CONECTADA = {
  id: 'conn-1',
  name: 'Principal',
  phone_number: null,
  status: 'connected',
  instance_id: 'inst-1',
  is_default: true,
  created_at: '2026-01-01T00:00:00Z',
};

const DESCONECTADA = {
  ...CONECTADA,
  id: 'conn-2',
  name: 'Vendas',
  status: 'disconnected',
};

beforeEach(() => {
  // O cache é de módulo (compartilhado): cada caso começa do zero.
  queryClient.clear();
  h.consultas = 0;
  h.colunasPedidas = [];
  h.handlers = [];
  h.linhas = [CONECTADA];
});

describe('useConnectionsList — cache curto compartilhado', () => {
  it('a segunda leitura dentro dos 30s vem do cache (uma ida ao banco)', async () => {
    const primeira = await loadConnectionsList();
    const segunda = await loadConnectionsList();

    expect(h.consultas).toBe(1);
    expect(segunda).toEqual(primeira);
    expect(segunda).toEqual([CONECTADA]);
  });

  it('invalidateConnectionsList derruba o cache: a proxima leitura volta ao banco', async () => {
    await loadConnectionsList();
    expect(h.consultas).toBe(1);

    h.linhas = [CONECTADA, DESCONECTADA];
    await invalidateConnectionsList();
    const depois = await loadConnectionsList();

    expect(h.consultas).toBe(2);
    expect(depois).toHaveLength(2);
  });

  it('pede colunas explicitas e nenhum segredo (qr_code/instance_token_secret_id)', async () => {
    await loadConnectionsList();

    const colunas = h.colunasPedidas[0];
    expect(colunas).toBe(CONNECTIONS_LIST_COLUMNS);
    expect(colunas).not.toContain('*');
    expect(colunas).not.toMatch(/qr_code|token|secret|password/i);
  });

  it('o realtime da faixa invalida a lista compartilhada (le de novo)', async () => {
    h.linhas = [DESCONECTADA];
    render(<EvolutionDisconnectBanner />);

    await waitFor(() => expect(h.consultas).toBe(1));
    await waitFor(() => expect(screen.getByText(/está desconectada/)).toBeDefined());
    expect(h.handlers.length).toBeGreaterThan(0);

    // A conexão voltou: o evento de realtime derruba o cache e a faixa relê.
    h.linhas = [CONECTADA];
    act(() => {
      h.handlers[0]({ eventType: 'UPDATE', new: { id: 'conn-2', status: 'connected' }, old: {} });
    });

    await waitFor(() => expect(h.consultas).toBe(2));
    await waitFor(() => expect(screen.queryByText(/está desconectada/)).toBeNull());
  });
});
