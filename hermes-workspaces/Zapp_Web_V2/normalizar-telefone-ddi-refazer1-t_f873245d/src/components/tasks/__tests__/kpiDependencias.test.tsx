/**
 * Cartão T13 (refazer 2) — a fatia da faixa de dependência que o cartão usa, e o
 * caminho inteiro do clique do KPI até o filtro.
 *
 * O refazer 1 foi recusado por escopo: entrou estrutura (provedor de contexto de
 * UI, etapa 069) que o cartão não pede. Esta versão corta tudo e deixa só o que
 * a faixa consome. Cada peça que fica está declarada aqui com a prova:
 *
 *   · etapa 024 (cartão pai) — `workItemFilters`: o campo `due`, o parse/serialize
 *     da URL e o "tem filtro ativo". Nenhum setter, nenhum estado novo.
 *   · etapa 023 (escritor que ESTE cartão precisou) — `useTasksFilters.setDue`:
 *     o clique do KPI não tinha como escrever no recorte de prazo sem ele.
 *   · etapa 021 / D13 (cartão pai) — `workItemAggregates`: `avgLeadTimeDays`, da
 *     criação à conclusão, e `formatLeadTime` (o texto "1,4 dias").
 *   · a ligação que o cartão entrega: clicar em "Atrasadas" escreve `due=overdue`
 *     na URL e o card fica pressionado; clicar de novo devolve `all` e limpa.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, renderHook, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { TasksKpiStrip } from '@/components/tasks/shared/TasksKpiStrip';
import { useTasksFilters } from '@/hooks/tasks/useTasksFilters';
import { DEFAULT_FILTERS, filtersFromSearch, isFilterActive, searchWithFilters } from '@/hooks/tasks/workItemFilters';
import { kpis, formatLeadTime } from '@/hooks/tasks/workItemAggregates';
import type { KpiSnapshot } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const wrapper = (search = '') => ({ children }: { children: ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: [`/${search}`] }, children);

const CHEIO: KpiSnapshot = {
  overdue: 2, dueToday: 4, doingCount: 1, done7d: 3,
  avgCycleTimeDays: 9, avgLeadTimeDays: 1.4,
};

beforeEach(() => {
  reduceMotion.value = false;
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('refazer 2 — etapa 024: o campo `due` viaja na URL', () => {
  it('lê `due` da query string e ignora valor fora da lista', () => {
    expect(filtersFromSearch('?due=overdue').due).toBe('overdue');
    expect(filtersFromSearch('?due=today').due).toBe('today');
    expect(filtersFromSearch('?due=xxx').due).toBe('all');
    expect(filtersFromSearch('').due).toBe('all');
  });

  it('`due` fora do padrão conta como filtro ativo (o "Limpar" aparece)', () => {
    expect(isFilterActive({ ...DEFAULT_FILTERS, due: 'overdue' })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTERS, due: 'all' })).toBe(false);
    expect(isFilterActive(DEFAULT_FILTERS)).toBe(false);
  });

  it('escreve só o recorte escolhido e o `all` limpa o parâmetro', () => {
    const comRecorte = new URLSearchParams(searchWithFilters('?view=tasks', { ...DEFAULT_FILTERS, due: 'overdue' }));
    expect(comRecorte.get('due')).toBe('overdue');
    expect(comRecorte.get('view')).toBe('tasks');

    const limpo = new URLSearchParams(searchWithFilters('?view=tasks&due=overdue', { ...DEFAULT_FILTERS, due: 'all' }));
    expect(limpo.get('due')).toBeNull();
    expect(limpo.get('view')).toBe('tasks');
  });
});

describe('refazer 2 — etapa 023: `setDue` é o escritor do recorte', () => {
  it('escreve no estado e espelha na URL; `all` devolve ao padrão', () => {
    const { result } = renderHook(() => useTasksFilters(), { wrapper: wrapper() });

    expect(result.current.filters.due).toBe('all');
    expect(result.current.isActive).toBe(false);

    act(() => { result.current.setDue('overdue'); });
    expect(result.current.filters.due).toBe('overdue');
    expect(result.current.isActive).toBe(true);
    expect(new URLSearchParams(window.location.search).get('due')).toBe('overdue');

    act(() => { result.current.setDue('all'); });
    expect(result.current.filters.due).toBe('all');
    expect(result.current.isActive).toBe(false);
    expect(new URLSearchParams(window.location.search).get('due')).toBeNull();
  });
});

describe('refazer 2 — o clique do KPI escreve no filtro (ponta a ponta)', () => {
  function FaixaComFiltros() {
    const f = useTasksFilters();
    const recorte = f.filters.due === 'overdue' || f.filters.due === 'today' ? f.filters.due : null;
    return (
      <TasksKpiStrip
        kpis={CHEIO}
        activeDue={recorte}
        onToggleDue={(due) => f.setDue(recorte === due ? 'all' : due)}
      />
    );
  }

  it('clicar em "Atrasadas" publica `due=overdue`; clicar de novo limpa', () => {
    render(<FaixaComFiltros />, { wrapper: wrapper() });
    const cardAtrasadas = () => screen.getByText('Atrasadas').closest('[data-testid="kpi-card"]') as HTMLElement;
    const botao = () => cardAtrasadas().querySelector('button') as HTMLButtonElement;

    expect(botao().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(botao());
    expect(new URLSearchParams(window.location.search).get('due')).toBe('overdue');
    expect(botao().getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(botao());
    expect(new URLSearchParams(window.location.search).get('due')).toBeNull();
    expect(botao().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('refazer 2 — etapa 021/D13: tempo médio da criação à conclusão', () => {
  const fim = new Date('2026-10-02T12:00:00Z');

  function concluida(leadDias: number, withStamp = true): WorkItem {
    const created = new Date(fim.getTime() - leadDias * 86_400_000);
    return {
      id: `i${leadDias}`, title: 'Concluída', description: null, status: 'done',
      priority: 'medium', due_date: null, remind_at: null, notified_at: null,
      waiting_reason: null, position: 0,
      started_at: new Date(fim.getTime() - 0.1 * 86_400_000).toISOString(),
      status_changed_at: fim.toISOString(),
      completed_at: withStamp ? fim.toISOString() : null,
      contact_id: null, created_by: 'p1', assigned_to: 'p1',
      created_at: created.toISOString(), updated_at: fim.toISOString(),
    };
  }

  it('mede `created_at` → `completed_at`, não o tempo de ciclo', () => {
    const k = kpis([concluida(1.4), concluida(1.4), concluida(1.4, false)], fim);

    expect(k.avgLeadTimeDays).toBeCloseTo(1.4, 10);
    // o ciclo (`started_at` → `completed_at`) é outro número: 0,1 dia.
    expect(k.avgCycleTimeDays).toBeCloseTo(0.1, 10);
    // a concluída sem carimbo não entra na média.
    expect(k.done7d).toBe(3);
  });

  it('`formatLeadTime` dá o texto pt-BR do card ("1,4 dias" / "1 dia" / "—")', () => {
    expect(formatLeadTime(1.4)).toBe('1,4 dias');
    expect(formatLeadTime(1)).toBe('1 dia');
    expect(formatLeadTime(null)).toBe('—');
  });

  it('o card "Tempo médio" mostra o número do lead time, não o do ciclo', () => {
    const k = kpis([concluida(1.4), concluida(1.4)], fim);
    render(<TasksKpiStrip kpis={k} />, { wrapper: wrapper() });

    const card = screen.getByText('Tempo médio').closest('[data-testid="kpi-card"]') as HTMLElement;
    expect(card.querySelector('[data-testid="kpi-value"]')?.textContent).toBe('1,4 dias');
    expect(card.querySelector('[data-testid="kpi-value"]')?.textContent).not.toBe('0,1 dias');
  });
});
