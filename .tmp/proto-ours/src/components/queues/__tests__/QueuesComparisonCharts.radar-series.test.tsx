/**
 * R2-QUE-008 (item 455 / P2) — prova no componente real:
 * duas filas com o MESMO nome não podem compartilhar a série do radar.
 *
 * Antes da correção o radar era montado com `dataKey = nome da fila` e o objeto
 * de dados usava o nome como chave (`Object.fromEntries(queues.map(q => [q.name, ...]))`).
 * Com nomes iguais a segunda fila sobrescrevia a primeira na MESMA chave e as
 * duas séries liam a mesma coluna: uma fila simplesmente desaparecia do radar
 * (a série de baixo ficava escondida atrás da de cima).
 *
 * O teste renderiza o componente com a Recharts substituída por espiões que
 * registram o que chega em `<RadarChart data>` e em cada `<Radar dataKey>`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  radars: [] as Array<{ name?: string; dataKey?: string }>,
}));

vi.mock('recharts', () => {
  const Node = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Node,
    BarChart: Node,
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Legend: () => <div />,
    RadarChart: ({ data, children }: { data?: Array<Record<string, unknown>>; children?: React.ReactNode }) => {
      captured.rows = data ?? [];
      return <div>{children}</div>;
    },
    PolarGrid: () => <div />,
    PolarAngleAxis: () => <div />,
    PolarRadiusAxis: () => <div />,
    Radar: ({ name, dataKey }: { name?: string; dataKey?: string }) => {
      captured.radars.push({ name, dataKey });
      return <div />;
    },
  };
});

import { QueuesComparisonCharts } from '@/components/queues/QueuesComparisonCharts';

interface QueuePerf {
  id: string;
  name: string;
  color: string;
  totalContacts: number;
  totalMessages: number;
  agentsCount: number;
  avgMessagesPerContact: number;
  assignedContacts: number;
}

function perf(over: Partial<QueuePerf> & Pick<QueuePerf, 'id' | 'name'>): QueuePerf {
  return {
    color: '#3B82F6',
    totalContacts: 0,
    totalMessages: 0,
    agentsCount: 0,
    avgMessagesPerContact: 0,
    assignedContacts: 0,
    ...over,
  };
}

function rowsByMetric() {
  return Object.fromEntries(captured.rows.map((row) => [String(row.metric), row]));
}

describe('QueuesComparisonCharts — filas de mesmo nome não compartilham a série do radar (R2-QUE-008)', () => {
  beforeEach(() => {
    captured.rows = [];
    captured.radars = [];
  });

  it('dá uma série própria a cada fila mesmo quando os nomes são iguais', () => {
    // Duas filas chamadas "Suporte", com números bem diferentes: se as séries se
    // misturarem, uma delas fica com os valores da outra (ou desaparece).
    const queueA = perf({ id: 'q1', name: 'Suporte', totalContacts: 10, totalMessages: 40, agentsCount: 4, avgMessagesPerContact: 4, assignedContacts: 5 });
    const queueB = perf({ id: 'q2', name: 'Suporte', totalContacts: 20, totalMessages: 10, agentsCount: 1, avgMessagesPerContact: 8, assignedContacts: 20 });

    render(<QueuesComparisonCharts queuesPerformance={[queueA, queueB]} />);

    // 1) O radar tem duas séries e cada uma lê a SUA própria coluna.
    expect(captured.radars).toHaveLength(2);
    const seriesKeys = captured.radars.map((radar) => radar.dataKey);
    expect(new Set(seriesKeys).size).toBe(2);
    expect(seriesKeys).toEqual(['q1', 'q2']);
    expect(captured.radars.map((radar) => radar.name)).toEqual(['Suporte', 'Suporte']);

    // 2) As linhas do radar carregam as DUAS filas, cada uma com os seus valores.
    const byMetric = rowsByMetric();
    expect(byMetric['Contatos']).toMatchObject({ q1: 50, q2: 100 });
    expect(byMetric['Mensagens']).toMatchObject({ q1: 100, q2: 25 });
    expect(byMetric['Atendentes']).toMatchObject({ q1: 100, q2: 25 });
    expect(byMetric['Média Msgs']).toMatchObject({ q1: 50, q2: 100 });
    expect(byMetric['Atribuídos']).toMatchObject({ q1: 50, q2: 100 });

    // 3) As duas séries desenhadas não são a mesma coisa.
    const seriesA = captured.rows.map((row) => row['q1']);
    const seriesB = captured.rows.map((row) => row['q2']);
    expect(seriesA).toEqual([50, 100, 100, 50, 50]);
    expect(seriesB).toEqual([100, 25, 25, 100, 100]);
    expect(seriesA).not.toEqual(seriesB);
  });

  it('mantém a comparação correta também com nomes diferentes (sem regressão)', () => {
    const queueA = perf({ id: 'q1', name: 'Suporte', totalContacts: 10, totalMessages: 40, agentsCount: 4, avgMessagesPerContact: 4, assignedContacts: 5 });
    const queueB = perf({ id: 'q2', name: 'Vendas', totalContacts: 20, totalMessages: 10, agentsCount: 1, avgMessagesPerContact: 8, assignedContacts: 20 });

    render(<QueuesComparisonCharts queuesPerformance={[queueA, queueB]} />);

    expect(captured.radars.map((radar) => radar.dataKey)).toEqual(['q1', 'q2']);
    expect(captured.radars.map((radar) => radar.name)).toEqual(['Suporte', 'Vendas']);

    const byMetric = rowsByMetric();
    expect(byMetric['Contatos']).toMatchObject({ q1: 50, q2: 100 });
    expect(byMetric['Mensagens']).toMatchObject({ q1: 100, q2: 25 });
  });
});
