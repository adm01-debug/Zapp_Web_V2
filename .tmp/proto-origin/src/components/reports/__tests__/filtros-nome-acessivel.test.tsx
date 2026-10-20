import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

// N-091 — Relatórios: nome nos filtros de período/agente.
// Os filtros são <Select> do Radix; o gatilho vira um <button role="combobox"> cujo conteúdo é
// só o ícone + o valor do <SelectValue> (texto visual "Últimos 7 dias" etc.). Sem aria-label, o
// leitor de tela anuncia "combobox" sem dizer o que ele filtra. Este teste cobra o nome
// acessível ("Período"/"Agente") nos 4 componentes e, por varredura de fonte, garante que nenhum
// <SelectTrigger> dos 4 arquivos ficou sem aria-label.

// O cliente Supabase é mockado como cadeia "thenable" genérica: qualquer método encadeado
// (select/eq/gte/lte/order/limit/range) devolve a mesma cadeia e o `await` resolve um conjunto
// vazio. Os componentes só precisam montar; a asserção é sobre o rótulo acessível do gatilho.
const h = vi.hoisted(() => {
  function makeQuery() {
    const resultado = { data: [] as unknown[], error: null, count: 0 };
    const proxy: unknown = new Proxy(Object.create(null), {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolver: (valor: unknown) => unknown) => Promise.resolve(resolver(resultado));
        }
        return () => proxy;
      },
    });
    return proxy;
  }
  return { makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

// useAgents fala com o banco por conta própria; aqui só precisa existir.
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [] }) }));

import { AbandonmentRate } from '../AbandonmentRate';
import { ConversationHeatmap } from '../ConversationHeatmap';
import { PeriodComparison } from '../PeriodComparison';
import { AdvancedReportsView } from '../AdvancedReportsView';

const ARQUIVOS = [
  'AdvancedReportsView.tsx',
  'AbandonmentRate.tsx',
  'ConversationHeatmap.tsx',
  'PeriodComparison.tsx',
];

describe('N-091 — nome acessível nos filtros de período/agente', () => {
  it('AbandonmentRate: o filtro de período tem nome acessível', () => {
    render(<AbandonmentRate />, { wrapper: TestQueryWrapper });
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });

  it('ConversationHeatmap: o filtro de período tem nome acessível', () => {
    render(<ConversationHeatmap />, { wrapper: TestQueryWrapper });
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });

  it('PeriodComparison: o filtro de período tem nome acessível', async () => {
    render(<PeriodComparison />, { wrapper: TestQueryWrapper });
    expect(await screen.findByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });

  it('AdvancedReportsView: os filtros de período e agente têm nome acessível', async () => {
    render(<AdvancedReportsView />, { wrapper: TestQueryWrapper });
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'Período' }).length).toBeGreaterThan(0));
    // "Agente" é único na árvore: prova que o gatilho do filtro de agente tem nome próprio.
    expect(screen.getByRole('combobox', { name: 'Agente' })).toBeInTheDocument();
  });
});

describe('N-091 — varredura: nenhum <SelectTrigger> dos 4 arquivos sem aria-label', () => {
  for (const arquivo of ARQUIVOS) {
    it(`${arquivo}: todo <SelectTrigger> tem aria-label`, () => {
      const src = readFileSync(join(process.cwd(), 'src', 'components', 'reports', arquivo), 'utf8');
      const gatilhos = src.match(/<SelectTrigger\b[\s\S]*?>/g) ?? [];
      expect(gatilhos.length).toBeGreaterThan(0);
      const semNome = gatilhos.filter((tag) => !/\baria-label\s*=/.test(tag));
      expect(semNome, `SelectTrigger sem aria-label em ${arquivo}: ${semNome.join(' | ')}`).toEqual([]);
    });
  }
});
