import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Tela 13 — "Campanha Pausada" (X156 · F11 Acompanhar campanha): os dois cards do painel
 * entram na tela com dado REAL da campanha.
 *
 * O que este teste trava:
 *  - "Resumo de Enviados" com a série montada das linhas reais de `talkx_recipients`
 *    (os chips somam a série exibida);
 *  - trocar a janela (24h → 6h) pede o painel de novo, recortado pela nova janela;
 *  - "Principais Métricas" com os KPIs da campanha (`talkx_campaign_report`) e o
 *    comparativo só com a base mínima de `talkx_benchmarks()`;
 *  - esqueleto enquanto o painel não volta — nunca "nenhum envio" na carga;
 *  - campanha sem envio no recorte: o vazio do card, não uma reta de zeros;
 *  - painel com erro: mostra o erro, não o vazio;
 *  - "quem pausou" no banner, pelo nome do perfil da FK `paused_by`.
 */

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const h = vi.hoisted(() => ({
  campanha: {} as Record<string, unknown>,
  linhas: [] as Array<{ sent_at: string; delivered_at: string | null; replied_at: string | null }>,
  kpis: null as Record<string, unknown> | null,
  kpisErro: null as { message: string } | null,
  benchmarks: null as Record<string, unknown> | null,
  ator: null as string | null,
  travarResumo: false,
  filtrosResumo: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [h.campanha],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetchCampaigns: vi.fn(),
    startCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Cadeia thenable que registra os filtros e RESPONDE pelo filtro de janela aplicado
// (`sent_at >= ...`), em vez de trazer a resposta pronta.
vi.mock('@/lib/supabaseHelpers', () => {
  const criarCadeia = (tabela: string) => {
    const filtros: Record<string, unknown> = {};
    if (tabela === 'talkx_recipients') h.filtrosResumo.push(filtros);

    const alvo = () => (tabela === 'talkx_campaigns'
      ? { data: h.ator ? { ator: { name: h.ator } } : null, error: null }
      : { data: h.linhas, error: null });

    const cadeia: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'not', 'order', 'limit']) cadeia[metodo] = () => cadeia;
    cadeia.gte = (coluna: string, valor: string) => {
      filtros[coluna] = valor;
      return cadeia;
    };
    cadeia.maybeSingle = () => Promise.resolve(alvo());
    cadeia.then = (ok: (v: unknown) => unknown) => {
      if (h.travarResumo) return new Promise(() => {});
      const desde = filtros.sent_at ? new Date(String(filtros.sent_at)).getTime() : Number.NEGATIVE_INFINITY;
      const dados = h.linhas.filter((l) => new Date(l.sent_at).getTime() >= desde);
      return Promise.resolve({ data: dados, error: null }).then(ok);
    };
    return cadeia;
  };

  return {
    fromTable: (tabela: string) => criarCadeia(tabela),
    supabase: {
      rpc: async (nome: string) => {
        if (nome === 'talkx_campaign_report') {
          if (h.kpisErro) return { data: null, error: h.kpisErro };
          return { data: { kpis: h.kpis ?? {} }, error: null };
        }
        return { data: h.benchmarks, error: null };
      },
    },
  };
});

import { TalkXCampaignPaused } from '../TalkXCampaignPaused';

const HORA_MS = 3_600_000;

function horasAtras(horas: number): string {
  return new Date(Date.now() - horas * HORA_MS).toISOString();
}

function renderTela() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignPaused campaignId="camp-pausada-1" onBack={() => {}} />
    </QueryClientProvider>,
  );
}

describe('TalkXCampaignPaused — painel da campanha (Tela 13)', () => {
  beforeEach(() => {
    h.campanha = {
      id: 'camp-pausada-1',
      name: 'Reativação de Leads',
      status: 'paused',
      paused_at: new Date(Date.now() - 2 * HORA_MS).toISOString(),
      replied_count: 2,
    };
    h.linhas = [];
    h.kpis = null;
    h.kpisErro = null;
    h.benchmarks = null;
    h.ator = null;
    h.travarResumo = false;
    h.filtrosResumo = [];
  });

  it('mostra o Resumo de Enviados e as Principais Métricas com o dado real da campanha', async () => {
    h.linhas = [
      { sent_at: horasAtras(1), delivered_at: horasAtras(1), replied_at: null },
      { sent_at: horasAtras(2), delivered_at: null, replied_at: horasAtras(2) },
    ];
    h.kpis = { sent_count: 4, delivered_count: 3, failed_count: 1, outcome_unknown_count: 0, avg_reply_secs: 161 };
    h.benchmarks = { global: { campaign_count: 2, avg_delivery_rate_pct: 60, avg_reply_rate_pct: 50 } };

    renderTela();

    expect(await screen.findByText('Resumo de Enviados')).toBeTruthy();
    expect(screen.getByText('Principais Métricas')).toBeTruthy();

    // chips somam a série montada das duas linhas reais
    expect(screen.getByText('Enviados 2')).toBeTruthy();
    expect(screen.getByText('Entregues 1')).toBeTruthy();
    expect(screen.getByText('Respostas 1')).toBeTruthy();

    // métricas da campanha: 3/4 entregues, 2/4 respondidas, 1/5 falhas, 161s de resposta
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('2m 41s')).toBeTruthy();

    // médias históricas de 2 campanhas: sem base mínima, nada de comparativo
    expect(screen.queryByText(/vs\. média/)).toBeNull();
  });

  it('com base mínima compara com a média histórica', async () => {
    h.linhas = [{ sent_at: horasAtras(1), delivered_at: horasAtras(1), replied_at: null }];
    h.kpis = { sent_count: 4, delivered_count: 3, failed_count: 0, outcome_unknown_count: 0, avg_reply_secs: 60 };
    h.benchmarks = { global: { campaign_count: 6, avg_delivery_rate_pct: 60, avg_reply_rate_pct: 50 } };

    renderTela();

    // 75% contra média de 60% = 25% acima (o texto vem junto da seta: "↑ 25% vs. média")
    expect(await screen.findByText(/25% vs\. média/)).toBeTruthy();
  });

  it('trocar a janela pede o painel de novo, recortado pela nova janela', async () => {
    h.linhas = [
      { sent_at: horasAtras(1), delivered_at: horasAtras(1), replied_at: null },
      { sent_at: horasAtras(8), delivered_at: horasAtras(8), replied_at: null },
    ];

    renderTela();
    expect(await screen.findByText('Enviados 2')).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Janela do resumo de enviados' }), {
      button: 0, ctrlKey: false, pointerType: 'mouse',
    });
    fireEvent.click(screen.getByRole('option', { name: 'Últimas 6 horas' }));

    // o envio de 8 horas atrás sai do recorte: a consulta foi refeita com a janela nova
    await waitFor(() => expect(screen.getByText('Enviados 1')).toBeTruthy());
    const janelas = h.filtrosResumo.map((f) => f.sent_at).filter(Boolean) as string[];
    expect(janelas.length).toBeGreaterThanOrEqual(2);
    const ultima = Date.now() - new Date(janelas[janelas.length - 1]).getTime();
    expect(Math.abs(ultima - 6 * HORA_MS)).toBeLessThan(5 * 60_000);
  });

  it('enquanto o painel não volta mostra esqueleto, nunca "nenhum envio"', async () => {
    h.travarResumo = true;
    h.kpis = { sent_count: 4, delivered_count: 3, failed_count: 0, outcome_unknown_count: 0, avg_reply_secs: 60 };

    renderTela();

    await waitFor(() => expect(document.querySelector('[data-talkx-query="loading"]')).toBeTruthy());
    expect(screen.queryByText('Nenhum envio registrado nesta campanha ainda.')).toBeNull();
  });

  it('campanha sem envio no recorte mostra o vazio do card', async () => {
    h.linhas = [];
    h.kpis = { sent_count: 0, delivered_count: 0, failed_count: 0, outcome_unknown_count: 0, avg_reply_secs: null };

    renderTela();

    expect(await screen.findByText('Nenhum envio registrado nesta campanha ainda.')).toBeTruthy();
    // sem denominador não há taxa: o card não inventa número
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('painel com erro mostra o erro, não o vazio', async () => {
    h.linhas = [];
    h.kpisErro = { message: 'sem permissão nesta campanha' };

    renderTela();

    expect(await screen.findByText(/Não foi possível carregar as painel da campanha/)).toBeTruthy();
    expect(screen.queryByText('Nenhum envio registrado nesta campanha ainda.')).toBeNull();
  });

  it('banner diz quem pausou pelo perfil de `paused_by`', async () => {
    h.ator = 'Ana Souza';
    h.linhas = [{ sent_at: horasAtras(1), delivered_at: null, replied_at: null }];

    renderTela();

    expect(await screen.findByText(/por Ana Souza/)).toBeTruthy();
  });
});
