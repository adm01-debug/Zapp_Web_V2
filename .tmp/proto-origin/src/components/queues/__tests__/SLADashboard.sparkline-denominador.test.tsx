/**
 * R2-SLA-001 — denominador único das sparklines de SLA (prova pela SAÍDA RENDERIZADA).
 *
 * Defeito: a sparkline de 1ª resposta usava o TOTAL de conversas com SLA
 * (`100 - breaches/totalConversations`) — a conversa PENDENTE entrava como sucesso.
 * Agora o denominador é `evaluatedConversations` (a conversa com desfecho de 1ª resposta).
 *
 * Prova sem mock de resposta: renderiza o dashboard REAL e lê a geometria do `polyline`
 * que o componente realmente pintou. Duas séries com o mesmo denominador saem idênticas;
 * com o denominador antigo a série de 1ª resposta fica reta (90, 90) e a prova cai.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// 2 dias: d1 só pendente (avaliada 0 de 5), d2 com 5 avaliadas e nenhuma violada.
//   fixed -> 1ª resposta = [0, 90]  | overall(slaRate) = [0, 90]  | conversas = [5, 5]
//   antigo -> 1ª resposta = [100, 100] ... vira reta e não fecha a prova
const DIAS = [
  { evaluatedConversations: 0, firstResponseBreaches: 0, totalBreaches: 0, totalConversations: 5, slaRate: 0 },
  { evaluatedConversations: 5, firstResponseBreaches: 0, totalBreaches: 0, totalConversations: 5, slaRate: 90 },
];

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: () => ({
    loading: false,
    data: {
      overall: {
        hasSample: true,
        overallRate: 90,
        totalConversations: 10,
        firstResponse: { rate: 90, onTime: 5, breached: 0, pending: 5, total: 5 },
      },
      byAgent: [],
    },
  }),
}));

vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: () => ({ loading: false, data: { dailyData: DIAS, trends: {} } }),
}));

vi.mock('@/components/settings/SLAConfigurationManager', () => ({ SLAConfigurationManager: () => null }));
vi.mock('@/components/settings/SLARulesManager', () => ({ SLARulesManager: () => null }));
vi.mock('@/components/dashboard/sla/SLAConfigTable', () => ({ SLAConfigTable: () => null }));

import { SLADashboard } from '../SLADashboard';
import { SLAMetricsDashboard } from '@/components/dashboard/SLAMetricsDashboard';

function renderComProvider(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** sparkline de 2 pontos, w=64 h=20, padding 2: x = 2 e 62; y = 18 (mínimo) e 2 (máximo). */
const CRESCENTE = '2,18 62,2'; // min→max: topo da queda desenhado
const RETA = '2,18 62,18'; // todos os valores iguais: reta embaixo

describe('denominador único das sparklines de SLA', () => {
  it('1ª resposta e taxa geral saem com o mesmo denominador (avaliada) e as conversas ficam retas', () => {
    renderComProvider(<SLADashboard />);
    const pontos = Array.from(document.querySelectorAll('polyline')).map((p) => p.getAttribute('points'));
    expect(pontos).toHaveLength(3);
    // as duas taxas (1ª resposta e geral) usam o MESMO denominador -> mesma geometria
    expect(pontos.filter((p) => p === CRESCENTE)).toHaveLength(2);
    // conversas: 5 e 5 -> série constante
    expect(pontos.filter((p) => p === RETA)).toHaveLength(1);
  });

  it('o KPI "No Prazo" desenha a série sobre a conversa avaliada (5 pendentes no dia 1 não viram "no prazo")', () => {
    renderComProvider(<SLAMetricsDashboard />);
    const card = screen.getByText('No Prazo').closest('[data-testid="kpi-card"]') as HTMLElement;
    const linha = within(card)
      .getAllByTestId('kpi-line')[0]
      .querySelectorAll('path');
    const d = Array.from(linha)
      .map((p) => p.getAttribute('d') ?? '')
      .find((v) => v.startsWith('M') && !v.trim().endsWith('Z'));
    expect(d).toBeTruthy();
    // com o denominador antigo (total - violadas) os dois dias dariam 5 -> linha reta
    const ys = Array.from(d!.matchAll(/,(-?[\d.]+)/g)).map((m) => m[1]);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});
