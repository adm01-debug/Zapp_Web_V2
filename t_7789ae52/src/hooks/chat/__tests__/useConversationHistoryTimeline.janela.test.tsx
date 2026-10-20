/**
 * R3-06 — "Últimos 7 dias" é 7 dias de **calendário** no fuso do navegador, não 168 h para trás.
 *
 * A janela do Histórico saía de `Date.now() - period * 24 * 60 * 60 * 1000`: às 22:30 de 30/09 o
 * recorte começava em 23/09 22:30 — ou seja, o rótulo "Últimos 7 dias" entregava **8 dias
 * parciais** e escondia quase todo o primeiro dia do intervalo.
 *
 * Âncora: 30/09/2026 22:30 no fuso do navegador. Esperado para 7 dias: 24/09 00:00 local
 * (dias 24, 25, 26, 27, 28, 29 e 30).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { startOfDay } from 'date-fns';
import { localDayKey, parseDayKey } from '@/lib/localDay';

const capturadas = vi.hoisted(() => ({ gte: [] as Array<{ tabela: string; valor: string }> }));

vi.mock('@/integrations/supabase/client', () => {
  // A tabela vai por closure: o hook monta as 5 queries antes de aguardar.
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = () => c;
    c.limit = () => c;
    c.gte = (_coluna: string, valor: string) => {
      capturadas.gte.push({ tabela, valor });
      return Promise.resolve({ data: [], error: null });
    };
    return c;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

import { useConversationHistoryTimeline } from '@/hooks/chat/useConversationHistoryTimeline';

const AGORA = new Date(2026, 8, 30, 22, 30, 0); // 30/09/2026 22:30 local
const inicioDoDia = (dia: string) => startOfDay(parseDayKey(dia) as Date).toISOString();

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const montar = (period: 7 | 30 | 90 | 0) =>
  renderHook(() => useConversationHistoryTimeline('contato-1', period, 'all', 50), { wrapper });

describe('useConversationHistoryTimeline — janela em dias de calendário', () => {
  beforeEach(() => {
    capturadas.gte = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('7 dias começa na meia-noite local do 7º dia (24/09), não 168 h atrás (23/09 22:30)', async () => {
    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const valores = [...new Set(capturadas.gte.map((c) => c.valor))];
    expect(valores).toHaveLength(1);
    expect(valores[0]).toBe(inicioDoDia('2026-09-24'));
    expect(localDayKey(valores[0])).toBe('2026-09-24');
    // e as 5 fontes da timeline usam a mesma janela
    expect(capturadas.gte.map((c) => c.tabela).sort()).toEqual([
      'contact_notes', 'conversation_events', 'conversation_tasks', 'messages', 'sales_deals',
    ]);
  });

  it('30 dias começa na meia-noite local do 30º dia (01/09)', async () => {
    const { result } = montar(30);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const valores = [...new Set(capturadas.gte.map((c) => c.valor))];
    expect(valores).toEqual([inicioDoDia('2026-09-01')]);
  });

  it('"Tudo" (0) continua sem recorte de data', async () => {
    const { result } = montar(0);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturadas.gte).toEqual([]);
  });
});
