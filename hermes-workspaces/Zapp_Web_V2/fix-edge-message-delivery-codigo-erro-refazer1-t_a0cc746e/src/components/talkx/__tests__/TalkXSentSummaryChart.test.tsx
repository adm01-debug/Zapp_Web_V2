import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre (mesmo ajuste de
// `TalkXPaginacao.tamanhoPagina.test.tsx`).
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

/**
 * X160 · T13-050…T13-057 — card "Resumo de Enviados" da tela 13 (campanha pausada).
 *
 * Prova o que o aceite da etapa pede:
 *  1. `paused_at` DENTRO da janela da série desenha o marcador com a hora da pausa;
 *  2. `paused_at` fora da janela não desenha marcador nenhum (nem antes nem depois);
 *  3. os chips somam a série exibida (Enviados/Entregues/Respostas);
 *  4. o select oferece as três janelas e devolve a escolha — o painel é pedido com
 *     `p_bucket='hour'` e `p_window_minutes` da janela escolhida.
 *
 * `recharts` é mockado (mesmo padrão de `TalkXCampaignRunning.janela-historico.test.tsx`):
 * o `ReferenceLine` do marcador vira um `div` com o rótulo, para a asserção enxergar
 * exatamente o texto que o componente manda desenhar.
 */
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    ResponsiveContainer: Box,
    LineChart: SvgBox,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceLine: ({ x, label }: { x?: string; label?: { value?: string } }) => (
      <div data-testid="marcador-pausa" data-bucket={x}>{label?.value}</div>
    ),
  };
});

import { TalkXSentSummaryChart } from '../tracking/TalkXSentSummaryChart';
import { SUMMARY_BUCKET, SUMMARY_WINDOWS, pausedMarker, summaryTotals } from '../tracking/talkxSentSummary';
import type { TalkXSentSummaryPoint } from '../tracking/talkxSentSummary';

/** Balde de hora no fuso local do ambiente (o componente formata de volta no mesmo fuso). */
const balde = (h: number, m = 0) => new Date(2026, 9, 8, h, m, 0, 0).toISOString();
const pausa = (h: number, m = 0) => new Date(2026, 9, 8, h, m, 0, 0).toISOString();

const serie: TalkXSentSummaryPoint[] = [
  { bucket: balde(12), sent: 3, delivered: 2, replied: 0 },
  { bucket: balde(13), sent: 4, delivered: 1, replied: 1 },
  { bucket: balde(14), sent: 0, delivered: 0, replied: 0 },
];

function renderChart(over: Partial<React.ComponentProps<typeof TalkXSentSummaryChart>> = {}) {
  return render(<TalkXSentSummaryChart points={serie} windowId="24h" {...over} />);
}

describe('Resumo de Enviados — TalkXSentSummaryChart (X160)', () => {
  it('paused_at dentro da janela desenha o marcador com a hora da pausa', () => {
    renderChart({ pausedAt: pausa(14, 32) });

    const marcador = screen.getByTestId('marcador-pausa');
    expect(marcador.textContent).toBe('14:32 Campanha pausada');
    // Ancorado no balde de hora que contém a pausa (14:00), não no eixo "14:32".
    expect(marcador.getAttribute('data-bucket')).toBe('14:00');
  });

  it('paused_at fora da janela não desenha marcador — nem antes nem depois da série', () => {
    const { unmount } = renderChart({ pausedAt: pausa(9, 5) });
    expect(screen.queryByTestId('marcador-pausa')).toBeNull();
    unmount();

    // Depois do fim da série (último balde 14:00 cobre até 15:00, exclusive).
    renderChart({ pausedAt: pausa(15, 0) });
    expect(screen.queryByTestId('marcador-pausa')).toBeNull();
  });

  it('chips somam a série exibida (e não um valor fixo)', () => {
    renderChart({ pausedAt: null });

    expect(screen.getByText('Enviados 7')).toBeTruthy();
    expect(screen.getByText('Entregues 3')).toBeTruthy();
    expect(screen.getByText('Respostas 1')).toBeTruthy();
  });

  it('o select oferece as três janelas e devolve a escolha', () => {
    const onWindowChange = vi.fn();
    renderChart({ onWindowChange, windowId: '24h' });

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Janela do resumo de enviados' }), {
      button: 0, ctrlKey: false, pointerType: 'mouse',
    });
    for (const janela of SUMMARY_WINDOWS) {
      expect(screen.getByRole('option', { name: janela.label })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('option', { name: 'Últimas 12 horas' }));
    expect(onWindowChange).toHaveBeenCalledWith('12h');
  });

  it('sem série não inventa marcador nem número', () => {
    render(<TalkXSentSummaryChart points={[]} pausedAt={pausa(14, 32)} />);

    expect(screen.queryByTestId('marcador-pausa')).toBeNull();
    expect(screen.getByText('Enviados 0')).toBeTruthy();
  });

  it('enquanto o painel não volta mostra esqueleto, não "nenhum envio"', () => {
    const { container } = render(<TalkXSentSummaryChart points={[]} loading />);

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText('Nenhum envio registrado nesta campanha ainda.')).toBeNull();
  });

  it('helpers puros: janela, soma e marcador', () => {
    expect(SUMMARY_BUCKET).toBe('hour');
    expect(SUMMARY_WINDOWS.map((w) => w.minutes)).toEqual([1440, 720, 360]);
    expect(summaryTotals(serie)).toEqual({ sent: 7, delivered: 3, replied: 1 });
    expect(pausedMarker(pausa(13, 15), serie)?.anchor).toBe('13:00');
    expect(pausedMarker(pausa(13, 15), serie)?.label).toBe('13:15 Campanha pausada');
    expect(pausedMarker(null, serie)).toBeNull();
    expect(pausedMarker('nao-e-data', serie)).toBeNull();
  });
});
