/**
 * X164 / TL-080 — "Mapa de Calor" da tela 14.
 *
 * Regras provadas: a grade vai de SEGUNDA a domingo (não Dom→Sáb); a matriz chega do
 * servidor já no fuso da campanha; a legenda é uma escala em degraus e a cor da célula
 * respeita o melhor (máximo) e o pior (zero) caso; linha incompleta do servidor não
 * quebra a grade.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) usa a API.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { TalkXReportHeatmap } from '../TalkXReportHeatmap';
import {
  talkxReportHeatmapCellColor,
  talkxReportHeatmapGrid,
} from '../talkxReportCharts';

/** Grade do mock: pico em Ter 14h (linha 1 = terça, hora 14). */
const matriz: number[][] = Array.from({ length: 7 }, (_, dia) =>
  Array.from({ length: 24 }, (_, hora) => (dia === 1 && hora === 14 ? 298 : dia === 1 ? 2 : 0)),
);

function abrirSelect() {
  fireEvent.pointerDown(screen.getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

describe('TalkXReportHeatmap (X164/TL-080)', () => {
  it('a grade começa na segunda e termina no domingo', () => {
    render(<TalkXReportHeatmap matrix={matriz} metric="replied" onMetricChange={vi.fn()} />);

    expect(screen.getAllByRole('rowheader').map((el) => el.textContent)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(screen.getByText('Mapa de Calor de Respostas')).toBeTruthy();
    expect(screen.getByText('Volume de respostas por dia da semana e horário')).toBeTruthy();
    expect(screen.getByTestId('heatmap-1-14').getAttribute('title')).toBe('Ter 14h · 298 respostas');
    expect(screen.getByTestId('heatmap-0-0').getAttribute('title')).toBe('Seg 00h · 0 respostas');
  });

  it('trocar a métrica avisa o pai e o título acompanha', () => {
    const onMetricChange = vi.fn();
    const { rerender } = render(<TalkXReportHeatmap matrix={matriz} metric="replied" onMetricChange={onMetricChange} />);

    abrirSelect();
    fireEvent.click(screen.getByRole('option', { name: 'Cliques' }));
    expect(onMetricChange).toHaveBeenCalledWith('clicked');

    rerender(<TalkXReportHeatmap matrix={matriz} metric="clicked" onMetricChange={onMetricChange} />);
    expect(screen.getByText('Mapa de Calor de Cliques')).toBeTruthy();
    expect(screen.getByText('Volume de cliques por dia da semana e horário')).toBeTruthy();
    expect(screen.getByTestId('heatmap-1-14').getAttribute('title')).toBe('Ter 14h · 298 cliques');
  });

  it('legenda em degraus e a cor do melhor e do pior caso', () => {
    render(<TalkXReportHeatmap matrix={matriz} metric="replied" onMetricChange={vi.fn()} />);

    expect(screen.getByText('Menor volume')).toBeTruthy();
    expect(screen.getByText('Maior volume')).toBeTruthy();
    const amostras = screen.getAllByTestId('heatmap-legenda-amostra');
    expect(amostras).toHaveLength(5);
    expect(Number(amostras[0].getAttribute('data-step'))).toBeLessThan(Number(amostras[4].getAttribute('data-step')));

    expect(talkxReportHeatmapCellColor(298, 298)).toBe('hsl(var(--primary) / 0.92)');
    expect(talkxReportHeatmapCellColor(0, 298)).toBe('hsl(var(--muted) / 0.3)');
    expect(screen.getByTestId('heatmap-1-14').getAttribute('style')).toContain('hsl(var(--primary) / 0.92)');
    expect(screen.getByTestId('heatmap-0-0').getAttribute('style')).toContain('hsl(var(--muted) / 0.3)');
  });

  it('linha incompleta do servidor não quebra a grade', () => {
    const incompleta = Array.from({ length: 7 }, (_, dia) => Array.from({ length: dia === 3 ? 23 : 24 }, () => 0));
    render(<TalkXReportHeatmap matrix={incompleta} metric="sent" onMetricChange={vi.fn()} />);

    expect(screen.getAllByTestId(/^heatmap-3-/)).toHaveLength(24);
    expect(screen.getByTestId('heatmap-3-23').getAttribute('data-value')).toBe('0');
    expect(talkxReportHeatmapGrid([]).every((row) => row.length === 24)).toBe(true);
  });
});
