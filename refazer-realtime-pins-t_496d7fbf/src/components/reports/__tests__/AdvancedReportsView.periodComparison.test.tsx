import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import { appDayKey, appDayStart, appShiftDayKey } from '@/lib/localDay';

// R2-MOD-017 — Relatórios Avançados.
// O defeito tinha duas faces, ambas no recorte de períodos:
//   (1) o período ATUAL ia do começo de N dias atrás ao fim de hoje = N+1 dias de calendário,
//       enquanto o anterior tinha N; a média por dia dividia o total por N → média inflada
//       (série uniforme de 70/dia aparecia como 80). Prova da auditoria: current_days 8,
//       reported_average 80, actual_average 70.
//   (2) a view recomputava o rótulo "Anterior" com uma subtração própria, então o INÍCIO exibido
//       caía um dia antes do INÍCIO efetivamente consultado.
// O mock imita o banco: filtra por created_at (gte/lte) e guarda as fronteiras consultadas, para
// o teste comparar CONSULTA x RÓTULO — não uma cópia da fórmula do componente.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const calls: { table: string; gte: string | null; lte: string | null }[] = [];
  const state = { rows: [] as Row[] };

  function makeQuery(table: string) {
    let gte: string | null = null;
    let lte: string | null = null;
    const run = (from: number, to: number) => {
      calls.push({ table, gte, lte });
      const rows = table === 'messages' ? state.rows : [];
      const filtered = rows.filter((r) => {
        const t = Date.parse(String(r.created_at));
        if (gte && t < Date.parse(gte)) return false;
        if (lte && t > Date.parse(lte)) return false;
        return true;
      });
      return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
    };
    const q: Record<string, unknown> = {
      select: () => q,
      gte: (_col: string, v: string) => { gte = v; return q; },
      lte: (_col: string, v: string) => { lte = v; return q; },
      eq: () => q,
      order: () => q,
      range: (f: number, t: number) => run(f, t),
    };
    return q;
  }

  return { calls, state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.makeQuery(table) },
}));

// useAgents fala com o banco por conta própria; aqui só precisa existir.
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [] }) }));

import { useReportsData } from '../useReportsData';
import { AdvancedReportsView } from '../AdvancedReportsView';

/** `perDay` mensagens por dia, para os últimos `days` dias de calendário (fuso do app). */
function seededMessages(days: number, perDay: number) {
  const rows: Record<string, unknown>[] = [];
  for (let d = 0; d < days; d += 1) {
    const base = appDayStart(d).getTime() + 12 * 60 * 60 * 1000; // 12:00 do dia
    for (let i = 0; i < perDay; i += 1) {
      rows.push({
        id: `m-${d}-${i}`,
        created_at: new Date(base).toISOString(),
        sender: i % 2 === 0 ? 'agent' : 'contact',
        agent_id: 'a1',
        contact_id: 'c1',
        is_read: true,
      });
    }
  }
  return rows;
}

/** Quantos dias de calendário (fuso do app) o intervalo [from, to] cobre. */
function coveredDays(fromISO: string, toISO: string) {
  const keys: string[] = [];
  for (let k = appDayKey(fromISO); k <= appDayKey(toISO); k = appShiftDayKey(k, 1)) keys.push(k);
  return keys;
}

/** Fronteiras de `messages` realmente consultadas, ordenadas pela data inicial. */
function messageWindows() {
  const seen = new Map<string, { gte: string; lte: string }>();
  for (const c of h.calls) {
    if (c.table !== 'messages' || !c.gte || !c.lte) continue;
    if (!seen.has(c.gte)) seen.set(c.gte, { gte: c.gte, lte: c.lte });
  }
  return [...seen.values()].sort((a, b) => Date.parse(a.gte) - Date.parse(b.gte));
}

/** Um QueryClient estável por teste (criar dentro do componente do wrapper gera refetch infinito). */
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useReportsData — recorte de períodos (R2-MOD-017)', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.state.rows = seededMessages(14, 70); // 70 msg/dia nos últimos 14 dias
  });

  it('com 7 dias o período atual cobre 7 dias de calendário e a média por dia usa o mesmo 7', async () => {
    const { result } = renderHook(() => useReportsData(), { wrapper: makeWrapper() });
    // Fixa o período em 7 dias antes de qualquer dado ser observado (default é 30).
    await act(async () => { result.current.setPeriod('7'); });

    await waitFor(() => expect(result.current.stats.avgMessagesPerDay).toBeGreaterThan(0));

    // 7 dias de calendário, não 8 (baseline: appDayStart(7)..appDayEnd(0)).
    expect(coveredDays(result.current.dateRange.from.toISOString(), result.current.dateRange.to.toISOString())).toHaveLength(7);
    // Série uniforme de 70/dia permanece 70 (baseline: 8*70/7 = 80).
    expect(result.current.stats.avgMessagesPerDay).toBe(70);
    expect(result.current.stats.totalMessages).toBe(7 * 70);
  });

  it('o período anterior tem a mesma duração (7 dias) e encosta no atual, sem lacuna nem sobreposição', async () => {
    const { result } = renderHook(() => useReportsData(), { wrapper: makeWrapper() });
    await act(async () => { result.current.setPeriod('7'); });
    await waitFor(() => expect(result.current.stats.avgMessagesPerDay).toBeGreaterThan(0));

    const atual = result.current.dateRange;
    const anterior = result.current.previousDateRange;
    expect(coveredDays(atual.from.toISOString(), atual.to.toISOString())).toHaveLength(7);
    expect(coveredDays(anterior.from.toISOString(), anterior.to.toISOString())).toHaveLength(7);
    // O dia seguinte ao fim do anterior é o dia em que o atual começa.
    expect(appShiftDayKey(appDayKey(anterior.to.toISOString()), 1)).toBe(appDayKey(atual.from.toISOString()));

    // A consulta do período anterior usa exatamente essas fronteiras (as mesmas do rótulo).
    h.calls.length = 0;
    await act(async () => { result.current.setCompareEnabled(true); });
    await waitFor(() => expect(result.current.stats.prevAvgMessagesPerDay).toBe(70));
    await waitFor(() => expect(messageWindows()).toHaveLength(1));
    const [consultaAnterior] = messageWindows();
    expect(consultaAnterior.gte).toBe(anterior.from.toISOString());
    expect(consultaAnterior.lte).toBe(anterior.to.toISOString());
  });
});

describe('AdvancedReportsView — rótulo do período anterior (R2-MOD-017)', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.state.rows = seededMessages(1, 7); // volume não importa para o rótulo
  });

  it('o rótulo "Anterior" mostra as mesmas fronteiras que foram consultadas', async () => {
    render(<AdvancedReportsView />, { wrapper: makeWrapper() });

    // O usuário liga a comparação; a partir daí os dois períodos são lidos.
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(messageWindows()).toHaveLength(2));

    const [previousWindow] = messageWindows();
    const badge = screen.getByText('Anterior:', { selector: 'span' }).parentElement as HTMLElement;
    const datas = (badge.textContent ?? '').match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
    expect(datas).toHaveLength(2);
    const inicio = datas[0] ?? '';
    expect(inicio).not.toBe('');
    // Início exibido == início consultado (baseline: exibia 1 dia antes; "21/09" para "22/09").
    expect(appDayKey(previousWindow.gte)).toBe(
      `${inicio.slice(6, 10)}-${inicio.slice(3, 5)}-${inicio.slice(0, 2)}`,
    );
    expect(inicio).toBe(format(new Date(previousWindow.gte), 'dd/MM/yyyy'));
  });
});
