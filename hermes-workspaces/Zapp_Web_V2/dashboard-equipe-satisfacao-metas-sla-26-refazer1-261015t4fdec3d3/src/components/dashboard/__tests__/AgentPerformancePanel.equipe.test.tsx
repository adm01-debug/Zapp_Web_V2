/**
 * `AgentPerformancePanel` — KPIs da equipe, ranking, destaque e distribuição.
 *
 * O sujeito é o painel REAL; a dublagem são as duas leituras (gamificação e SLA)
 * e o `ResponsiveContainer` do recharts (mede 0x0 no jsdom). O cruzamento de SLA
 * por agente é o ponto fino: `useSLAMetrics.byAgent[].agentId` casa com
 * `useLeaderboard.agents[].profile_id` — sem esse casamento a coluna SLA fica "—".
 *
 * O erro da leitura do ranking (estado de falha) é outro cartão — está como
 * `it.todo` no fim, com o motivo.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ ranking: vi.fn(), sla: vi.fn() }));

vi.mock('@/hooks/gamification/useLeaderboard', () => ({
  useLeaderboard: (...a: unknown[]) => h.ranking(...a),
}));
vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: (...a: unknown[]) => h.sla(...a),
}));
vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="donut">{children}</div>,
  };
});

import { AgentPerformancePanel } from '../AgentPerformancePanel';
import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';

function agente(over: Partial<LeaderboardAgent> & { id: string; name: string }): LeaderboardAgent {
  return {
    profile_id: `p-${over.id}`,
    xp: 100,
    level: 2,
    streak: 1,
    messagesHandled: 10,
    conversationsResolved: 5,
    avgResponseTime: 60_000,
    satisfaction: 300,
    rank: 1,
    previousRank: 1,
    achievements: [],
    achievementsCount: 0,
    isOnline: true,
    ...over,
  };
}

const ANA = agente({ id: 'ana', name: 'Ana', conversationsResolved: 10, messagesHandled: 30, avgResponseTime: 60_000, xp: 900, level: 5, satisfaction: 500 });
const BIA = agente({ id: 'bia', name: 'Bia', conversationsResolved: 5, messagesHandled: 20, avgResponseTime: 30_000, xp: 500, level: 3, satisfaction: 400 });
const CAIO = agente({ id: 'caio', name: 'Caio', conversationsResolved: 1, messagesHandled: 5, avgResponseTime: 90_000, xp: 9_000, level: 1, satisfaction: 300, isOnline: false });

const SLA = {
  overall: { firstResponse: { total: 1, onTime: 1, breached: 0, pending: 0, rate: 100 }, totalConversations: 1, hasSample: true, overallRate: 100 },
  byAgent: [{ agentId: 'p-ana', agentName: 'Ana', firstResponse: { total: 1, onTime: 1, breached: 0, pending: 0, rate: 75 }, overallRate: 75 }],
};

const NOMES = ['Ana', 'Bia', 'Caio'];

function nomesDoRanking(): string[] {
  const tabela = screen.getByTestId('team-ranking-card');
  return within(tabela)
    .getAllByRole('row')
    .slice(1)
    .map((linha) => NOMES.find((n) => linha.textContent?.includes(n)) ?? '?');
}

async function escolherNoSeletor(rotulo: string, opcao: string) {
  const gatilho = screen.getByRole('combobox', { name: rotulo });
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.pointerUp(gatilho, { button: 0, pointerType: 'mouse' });
  fireEvent.click(gatilho);
  const item = await screen.findByRole('option', { name: opcao });
  fireEvent.click(item);
}

beforeEach(() => {
  h.ranking.mockReset();
  h.sla.mockReset();
  h.ranking.mockReturnValue({ agents: [ANA, BIA, CAIO], isLoading: false, timeRange: 'week', setTimeRange: vi.fn() });
  h.sla.mockReturnValue({ data: SLA, loading: false });
});

beforeAll(() => {
  // O Radix Select usa captura de ponteiro; o jsdom não traz os três métodos.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe('AgentPerformancePanel — carregando e vazio', () => {
  it('enquanto a leitura corre mostra "Carregando ranking…" e nenhuma linha', () => {
    h.ranking.mockReturnValue({ agents: [], isLoading: true, timeRange: 'week', setTimeRange: vi.fn() });

    render(<AgentPerformancePanel />);

    expect(screen.getByText('Carregando ranking…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum dado de performance disponível')).not.toBeInTheDocument();
  });

  it('sem agentes não inventa número: KPIs zerados, aviso no ranking e "Sem agentes" na distribuição', async () => {
    h.ranking.mockReturnValue({ agents: [], isLoading: false, timeRange: 'week', setTimeRange: vi.fn() });
    h.sla.mockReturnValue({ data: undefined, loading: false });

    render(<AgentPerformancePanel />);

    expect(screen.getByText('Nenhum dado de performance disponível')).toBeInTheDocument();
    expect(screen.getByText('Sem agentes')).toBeInTheDocument();
    expect(screen.getByText('As metas são configuradas por agente na aba Metas.')).toBeInTheDocument();
    expect(screen.queryByText('Destaque do dia')).not.toBeInTheDocument();

    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByText('—/5')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });
});

describe('AgentPerformancePanel — equipe com dados', () => {
  it('resume online, resolvidas, tempo médio e satisfação média da equipe', async () => {
    render(<AgentPerformancePanel />);

    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('67% da equipe')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('16')).toBeInTheDocument());
    // (500 + 400 + 300) / 3 / 100 = 4.0
    expect(screen.getByText('4.0/5')).toBeInTheDocument();
  });

  it('ordena por conversas resolvidas e escreve "—" no SLA de quem não casou por profile_id', () => {
    render(<AgentPerformancePanel />);

    expect(nomesDoRanking()).toEqual(['Ana', 'Bia', 'Caio']);
    const linhas = within(screen.getByTestId('team-ranking-card')).getAllByRole('row').slice(1);
    // coluna SLA (índice 5): Ana casa pelo profile_id, Bia não tem leitura de SLA
    expect(within(linhas[0]).getAllByRole('cell')[5]).toHaveTextContent('75%');
    expect(within(linhas[1]).getAllByRole('cell')[5]).toHaveTextContent('—');
    const tabela = screen.getByTestId('team-ranking-card');
    expect(within(tabela).getAllByText('Online')).toHaveLength(2);
    expect(within(tabela).getAllByText('Offline')).toHaveLength(1);
  });

  it('destaque do dia usa o líder do ranking e o SLA dele', () => {
    render(<AgentPerformancePanel />);

    const destaque = screen.getByTestId('team-highlight-card');
    expect(within(destaque).getByText('Ana')).toBeInTheDocument();
    expect(within(destaque).getByText('Resolvidas').parentElement).toHaveTextContent('10');
    expect(within(destaque).getByText('SLA').parentElement).toHaveTextContent('75%');
    expect(within(destaque).getByText('Satisfação').parentElement).toHaveTextContent('5.0');
  });

  it('"Ordenar por" troca a ordem exibida (XP põe o Caio em primeiro)', async () => {
    render(<AgentPerformancePanel />);
    expect(nomesDoRanking()).toEqual(['Ana', 'Bia', 'Caio']);

    await escolherNoSeletor('Ordenar ranking de performance', 'XP');

    expect(nomesDoRanking()).toEqual(['Caio', 'Ana', 'Bia']);
  });

  it('o período do ranking avisa o hook com o valor escolhido', async () => {
    const setTimeRange = vi.fn();
    h.ranking.mockReturnValue({ agents: [ANA, BIA, CAIO], isLoading: false, timeRange: 'week', setTimeRange });

    render(<AgentPerformancePanel />);
    await escolherNoSeletor('Período do ranking de performance', 'Hoje');

    expect(setTimeRange).toHaveBeenCalledWith('today');
  });
});

describe('AgentPerformancePanel — caminhos que dependem de outro cartão', () => {
  it.todo(
    'falha na leitura do ranking mostra aviso com "tentar de novo" em vez de lista vazia: o hook não expõe `error` / `refetch` (t_a879eb31, leaderboard erro)',
  );
});
