import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  respostas: {} as Record<string, { count: number | null; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const fabricar = (tabela: string) => {
    const r = () => h.respostas[tabela] ?? { count: 0, error: null };
    const cadeia: Record<string, unknown> = {
      select: () => cadeia,
      eq: () => cadeia,
      not: () => cadeia,
      gte: () => cadeia,
      lte: () => cadeia,
      lt: () => cadeia,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: null, error: r().error, count: r().count })),
    };
    return cadeia;
  };
  return { supabase: { from: (t: string) => fabricar(t) } };
});

import { fetchDailyBrief } from '@/lib/assistant/dailyBrief';

describe('fetchDailyBrief — Resumo do dia (Fase 2)', () => {
  it('devolve as três contagens quando as leituras passam', async () => {
    h.respostas = {
      conversation_tasks: { count: 3, error: null },
      messages: { count: 7, error: null },
      sales_deals: { count: 2, error: null },
    };
    const brief = await fetchDailyBrief('perfil-1');
    expect(brief).toEqual({
      todayCommitments: 3,
      stalledConversations: 7,
      unreadProposals: 2,
      failures: [],
    });
  });

  it('leitura falha vira "não verificado", nunca zero silencioso', async () => {
    h.respostas = {
      conversation_tasks: { count: null, error: { message: 'boom' } },
      messages: { count: 7, error: null },
      sales_deals: { count: 2, error: null },
    };
    const brief = await fetchDailyBrief('perfil-1');
    expect(brief.failures).toContain('compromissos');
    expect(brief.stalledConversations).toBe(7);
  });
});