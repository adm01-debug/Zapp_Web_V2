import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/**
 * PL-09 — aba Equipe: os KPIs do topo valem para a EQUIPE INTEIRA (não só para
 * as 10 linhas da tabela), a satisfação aparece na escala da RPC (% de notas >= 4,
 * nunca "0.9/5") e quem não tem amostra mostra "—" e fica fora das médias.
 */

type Agente = {
  id: string; profile_id: string; name: string; avatar?: string;
  xp: number; level: number; streak: number;
  messagesHandled: number; conversationsResolved: number;
  avgResponseTime: number | null; satisfaction: number | null;
  rank: number; previousRank: number; achievements: string[]; achievementsCount: number;
  isOnline: boolean;
};

const h = vi.hoisted(() => ({ agents: [] as unknown[], isLoading: false }));

vi.mock('@/hooks/gamification/useLeaderboard', () => ({
  useLeaderboard: () => ({
    agents: h.agents,
    isLoading: h.isLoading,
    isRefreshing: false,
    error: null,
    timeRange: 'week',
    setTimeRange: vi.fn(),
    handleRefresh: vi.fn(),
  }),
  // Mesmo valor do hook real: a tabela é o top-N; os KPIs usam a lista completa.
  RANKING_TABLE_LIMIT: 10,
}));

vi.mock('@/hooks/sla/useSLAMetrics', () => ({ useSLAMetrics: () => ({ data: { byAgent: [] } }) }));

// Sem animação de contagem: o valor numérico do KPI aparece "de uma vez" e o teste
// lê o número real (com animação, o jsdom ficaria no quadro inicial, "0").
vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  return { ...real, useReducedMotion: () => true };
});

import { AgentPerformancePanel } from '../AgentPerformancePanel';

function agente(i: number, over: Partial<Agente> = {}): Agente {
  return {
    id: `perfil-${i}`,
    profile_id: `perfil-${i}`,
    name: `Agente ${i}`,
    xp: 100,
    level: 3,
    streak: 1,
    messagesHandled: 20,
    conversationsResolved: 10,
    avgResponseTime: null,
    satisfaction: null,
    rank: i + 1,
    previousRank: i + 1,
    achievements: [],
    achievementsCount: 0,
    isOnline: true,
    ...over,
  };
}

function valorDoKpi(indice: number): string {
  const cartoes = screen.getAllByTestId('kpi-card');
  if (!cartoes[indice]) throw new Error(`card de KPI na posição ${indice} não encontrado`);
  return within(cartoes[indice]).getAllByTestId('kpi-value')[0].textContent ?? '';
}

/** Os 4 KPIs do topo aparecem nesta ordem no painel. */
const KPI = { online: 0, resolvidas: 1, tempo: 2, satisfacao: 3 } as const;

const quinze = (): Agente[] => Array.from({ length: 15 }, (_, i) => agente(i,
  i < 3
    ? { satisfaction: 80 + i * 10, avgResponseTime: 30 + i * 30 } // 80/90/100 e 30/60/90 s
    : {},
));

describe('AgentPerformancePanel — equipe inteira e escala do CSAT', () => {
  beforeEach(() => { h.agents = quinze(); h.isLoading = false; });

  it('KPIs contam os 15 atendentes e a tabela mostra só o top-10', () => {
    const { container } = render(<AgentPerformancePanel />);

    expect(valorDoKpi(KPI.online)).toBe('15/15');
    expect(valorDoKpi(KPI.resolvidas)).toBe('150');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.getByText('Agente 9')).toBeInTheDocument();
    expect(screen.queryByText('Agente 10')).not.toBeInTheDocument();
  });

  it('satisfação sai em % (notas >= 4) e a média usa só quem tem avaliação', () => {
    render(<AgentPerformancePanel />);

    // 80 + 90 + 100 sobre 3 agentes com amostra = 90% (nunca "0.9/5").
    expect(valorDoKpi(KPI.satisfacao)).toBe('90%');
    // Média só das 3 amostras de tempo: (30+60+90)/3 = 60 s; sobre os 15 daria 12 s.
    expect(valorDoKpi(KPI.tempo)).toBe('1m 0s');
  });

  it('sem avaliação no período, satisfação e tempo mostram "—" (não 0)', () => {
    h.agents = Array.from({ length: 15 }, (_, i) => agente(i)); // ninguém com amostra

    render(<AgentPerformancePanel />);

    expect(valorDoKpi(KPI.satisfacao)).toBe('—');
    expect(valorDoKpi(KPI.tempo)).toBe('—');
  });

  it('na tabela, atendente sem 1ª resposta medida mostra "—" no tempo de resposta', () => {
    const { container } = render(<AgentPerformancePanel />);

    const celulas = Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.textContent ?? '');
    // O 4º e o 5º (posições 3 e 4) não têm amostra; o 1º tem 30 s.
    expect(celulas[0]).toContain('30s');
    expect(celulas[3]).toContain('—');
  });

  it('destaque do dia: satisfação e tempo do líder na escala certa', () => {
    render(<AgentPerformancePanel />);

    const destaque = screen.getByTestId('team-highlight-card');
    expect(within(destaque).getByText('80%')).toBeInTheDocument();
    expect(within(destaque).getByText('30s')).toBeInTheDocument();
  });

  it('destaque do dia sem amostra mostra "—" nos dois campos', () => {
    h.agents = [agente(0, { satisfaction: null, avgResponseTime: null })];

    render(<AgentPerformancePanel />);

    const destaque = screen.getByTestId('team-highlight-card');
    expect(within(destaque).getAllByText('—').length).toBeGreaterThanOrEqual(3); // SLA, tempo e satisfação
  });
});
