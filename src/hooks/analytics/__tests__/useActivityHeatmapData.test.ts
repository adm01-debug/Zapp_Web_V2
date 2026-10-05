import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// DASH-CONTROLS-001 (ponto 3): o queryFn do ActivityHeatmap ignorava `metric` —
// a query key mudava mas a consulta sempre contava mensagens. Estes testes
// provam que cada métrica conta a fonte certa:
//   messages      → linhas de `messages`
//   conversations → contatos distintos com mensagem no dia (conversa = contato)
//   resolutions   → linhas de `conversation_closures` (evento canônico de resolução)

const h = vi.hoisted(() => ({
  calls: [] as { table: string; select?: string }[],
  messagesRows: [] as { created_at: string; contact_id: string | null }[],
  closuresRows: [] as { created_at: string }[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (cols: string) => {
        h.calls.push({ table, select: cols });
        return {
          gte: async () => ({
            data: table === 'messages' ? h.messagesRows
              : table === 'conversation_closures' ? h.closuresRows
              : [],
            error: null,
          }),
        };
      },
    }),
  },
}));

import { fetchDailyActivity, useActivityHeatmapData } from '../useActivityHeatmapData';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

const dia = (offsetDias: number) => new Date(Date.now() - offsetDias * 86400000).toISOString();

beforeEach(() => {
  h.calls.length = 0;
  h.messagesRows = [];
  h.closuresRows = [];
});

describe('fetchDailyActivity — métrica muda a fonte/contagem', () => {
  it('messages conta todas as linhas do dia', async () => {
    h.messagesRows = [
      { created_at: dia(1), contact_id: 'c1' },
      { created_at: dia(1), contact_id: 'c1' },
      { created_at: dia(1), contact_id: 'c2' },
    ];
    const counts = await fetchDailyActivity('messages', new Date(Date.now() - 7 * 86400000));
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });

  it('conversations conta contatos distintos no dia, não mensagens', async () => {
    h.messagesRows = [
      { created_at: dia(1), contact_id: 'c1' },
      { created_at: dia(1), contact_id: 'c1' },
      { created_at: dia(1), contact_id: 'c2' },
    ];
    const counts = await fetchDailyActivity('conversations', new Date(Date.now() - 7 * 86400000));
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    // Antes do fix: o queryFn ignorava a métrica e devolvia 3 (mensagens).
    expect(total).toBe(2);
  });

  it('resolutions lê conversation_closures, não messages', async () => {
    h.messagesRows = [{ created_at: dia(1), contact_id: 'c1' }];
    h.closuresRows = [{ created_at: dia(2) }, { created_at: dia(2) }];
    const counts = await fetchDailyActivity('resolutions', new Date(Date.now() - 7 * 86400000));
    expect(h.calls.map(c => c.table)).toEqual(['conversation_closures']);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('useActivityHeatmapData — a query key + queryFn incluem a métrica', () => {
  it('trocar a métrica troca a tabela consultada', async () => {
    h.closuresRows = [{ created_at: dia(0) }];
    const { result, rerender } = renderHook(
      ({ metric }: { metric: 'messages' | 'resolutions' }) => useActivityHeatmapData('3m', metric, true),
      { initialProps: { metric: 'messages' }, wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.calls.map(c => c.table)).toEqual(['messages']);

    rerender({ metric: 'resolutions' });
    await waitFor(() => expect(h.calls.map(c => c.table)).toContain('conversation_closures'));
  });
});
