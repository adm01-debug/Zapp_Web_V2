import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * X146 — faixa de KPIs ao vivo das telas 11 e 12 (`TalkXLiveKpiRow`).
 *
 * A faixa é APRESENTACIONAL: recebe o objeto do painel (`useTalkXMonitorPanel`, X144) e
 * não faz consulta nenhuma. O que este teste protege é a regra que o revisor recusa
 * quando quebrada (A9): comparativo sem dado NÃO vira 0% nem "—" — a linha não existe.
 *
 * Cada caso abaixo é o defeito real do mock (inventário F_telas_11_12_13.md):
 * 1. T11-022/T12-021 sem `vs_yesterday` (payload nulo) -> nenhum "vs. ontem" na tela;
 * 2. T11-016/T12-015 `forecast.vs_pct = 12` -> "12% vs. previsto";
 * 3. T11-028 opt-outs 18 de 1.250 contatos -> "1,4% da base" (uma casa, vírgula);
 * 4. T12-026 variante da tela 12 -> "Destinatários Restantes" com "de 5.000 contatos";
 * 5. T11-025/T12-024 `outcome_unknown` -> linha "N a confirmar" que filtra a tabela.
 *
 * O componente real do cartão (`DashboardKpiCard`) NÃO é mockado: a asserção é sobre o
 * texto que o usuário lê.
 */

import { TalkXLiveKpiRow, type TalkXLiveKpiPanel } from '../tracking/TalkXLiveKpiRow';

const base = (): TalkXLiveKpiPanel => ({
  sent: 1250,
  delivered: 1180,
  replied: 289,
  failed: 42,
  outcome_unknown: 0,
  opt_outs: null,
  audience: 5000,
  forecast: null,
  vs_yesterday: null,
});

describe('TalkXLiveKpiRow — faixa de KPIs ao vivo (X146)', () => {
  it('comparativo sem dado não vira linha: payload com vs_yesterday=null não tem "vs. ontem"', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), vs_yesterday: null }} />);

    expect(screen.queryByText(/vs\. ontem/)).toBeNull();
    // ...e o valor do cartão continua na tela: a ausência do comparativo não esconde a métrica.
    expect(screen.getByText('Respondidas')).toBeTruthy();
  });

  it('forecast.vs_pct=12 mostra "12% vs. previsto" no cartão Enviadas', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), forecast: { vs_pct: 12 } }} />);

    expect(screen.getByText(/12% vs\. previsto/)).toBeTruthy();
  });

  it('forecast negativo mostra a queda, não um número positivo disfarçado', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), forecast: { vs_pct: -7 } }} />);

    expect(screen.getByText(/↓ 7% vs\. previsto/)).toBeTruthy();
  });

  it('vs_yesterday preenchido mostra "vs. ontem" nos cartões de respostas e falhas', () => {
    // O `pct` do painel é a variação COM sinal: +23% de respostas, -3% de falhas (o mock
    // mostra "↓ 3% vs. ontem" justamente porque as falhas caíram).
    render(
      <TalkXLiveKpiRow
        variant="tela11"
        panel={{ ...base(), vs_yesterday: { replied_pct: 23, failed_pct: -3 } }}
      />,
    );

    expect(screen.getByText(/↑ 23% vs\. ontem/)).toBeTruthy();
    expect(screen.getByText(/↓ 3% vs\. ontem/)).toBeTruthy();
  });

  it('opt-outs 18 de 1.250 contatos mostra "1,4% da base"', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), opt_outs: 18, audience: 1250 }} />);

    expect(screen.getByText('Opt-outs')).toBeTruthy();
    expect(screen.getByText('1,4% da base')).toBeTruthy();
  });

  it('opt-outs sem base conhecida: o cartão aparece e a porcentagem NÃO é inventada', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), opt_outs: 18, audience: null }} />);

    expect(screen.getByText('Opt-outs')).toBeTruthy();
    expect(screen.queryByText(/% da base/)).toBeNull();
  });

  it('opt-outs sem dado (null) não entra na faixa da tela 11', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), opt_outs: null }} />);

    expect(screen.queryByText('Opt-outs')).toBeNull();
    // a faixa da tela 11 fica com os quatro primeiros cartões
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(4);
  });

  it('variante da tela 12: mostra "Destinatários Restantes" com "de 5.000 contatos" e a barra', () => {
    const { container } = render(
      <TalkXLiveKpiRow variant="tela12" panel={{ ...base(), outcome_unknown: 3 }} />,
    );

    expect(screen.getByText('Destinatários Restantes')).toBeTruthy();
    expect(screen.getByText('de 5.000 contatos')).toBeTruthy();
    expect(screen.getByText('Mensagens Enviadas')).toBeTruthy();
    expect(screen.getByText('Respostas')).toBeTruthy();
    // a barra que antes vivia no bloco "Progresso geral" agora mora neste cartão
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    // 1.250 + 42 + 3 de 5.000 processados -> 25,9% concluído
    expect(bar?.getAttribute('aria-valuenow')).toBe('26');
    // a tela 12 não tem tabela para filtrar: a linha "a confirmar" é texto, não botão
    expect(screen.getByText('3 a confirmar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '3 a confirmar' })).toBeNull();
  });

  it('tela 12 sem audiência conhecida: sem "de N contatos", sem barra e sem inventar 0', () => {
    const { container } = render(
      <TalkXLiveKpiRow variant="tela12" panel={{ ...base(), audience: null }} />,
    );

    expect(screen.getByText('Destinatários Restantes')).toBeTruthy();
    expect(screen.queryByText(/contatos$/)).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    // sem audiência não há "restantes": o cartão mostra "—", nunca 0
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('a tela 12 não mostra o cartão de Opt-outs (o mock dela não tem esse cartão)', () => {
    render(<TalkXLiveKpiRow variant="tela12" panel={{ ...base(), opt_outs: 18 }} />);

    expect(screen.queryByText('Opt-outs')).toBeNull();
  });

  it('outcome_unknown vira a linha "N a confirmar" e o clique filtra a tabela', () => {
    const onFilterOutcomeUnknown = vi.fn();
    render(
      <TalkXLiveKpiRow
        variant="tela11"
        panel={{ ...base(), outcome_unknown: 7 }}
        onFilterOutcomeUnknown={onFilterOutcomeUnknown}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '7 a confirmar' }));
    expect(onFilterOutcomeUnknown).toHaveBeenCalledTimes(1);
  });

  it('sem outcome_unknown não existe a linha "a confirmar"', () => {
    render(<TalkXLiveKpiRow variant="tela11" panel={{ ...base(), outcome_unknown: 0 }} />);

    expect(screen.queryByText(/a confirmar/)).toBeNull();
  });

  it('mini-barras: cada cartão recebe a própria série do painel (e sem série não inventa barras)', () => {
    const { container } = render(
      <TalkXLiveKpiRow
        variant="tela11"
        panel={{ ...base(), spark: { sent: [1, 4, 2], delivered: [0, 3, 3] } }}
      />,
    );

    // duas séries com 3 pontos -> duas caixas de barras; os outros cartões ficam sem barras
    expect(container.querySelectorAll('[data-testid="kpi-bars"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="kpi-bars-empty"]')).toHaveLength(2);
  });

  it('série de um ponto só não vira mini-gráfico', () => {
    const { container } = render(
      <TalkXLiveKpiRow variant="tela11" panel={{ ...base(), spark: { sent: [5] } }} />,
    );

    expect(container.querySelectorAll('[data-testid="kpi-bars"]')).toHaveLength(0);
  });
});

