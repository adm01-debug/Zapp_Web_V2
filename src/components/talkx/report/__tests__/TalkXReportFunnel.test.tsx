/**
 * X164 / TL-080 — "Funil de Conversão" da tela 14.
 *
 * Regras provadas: degrau sem fonte (campanha sem link → `clicked` nulo) NÃO é
 * desenhado; cada trapézio é proporcional ao % do degrau sobre os ENVIADOS; o seletor
 * de segmento só aparece quando a campanha tem mais de um segmento; o % é arredondado
 * para uma casa antes de decidir se a casa decimal aparece (99,96% → "100%").
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) usa a API.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { TalkXReportFunnel } from '../TalkXReportFunnel';
import {
  talkxReportFunnelRows,
  talkxReportTrapezoidPoints,
  type TalkXReportFunnelStep,
} from '../talkxReportCharts';

/** Números do mock da tela 14. */
const comLink: TalkXReportFunnelStep[] = [
  { key: 'sent', count: 12480 },
  { key: 'delivered', count: 12032 },
  { key: 'replied', count: 2843 },
  { key: 'clicked', count: 1926 },
  { key: 'converted', count: 478 },
];

const semLink: TalkXReportFunnelStep[] = comLink.map((s) => (s.key === 'clicked' ? { ...s, count: null } : s));

function abrirSelect() {
  fireEvent.pointerDown(screen.getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

describe('TalkXReportFunnel (X164/TL-080)', () => {
  it('campanha sem link desenha 4 degraus — o degrau sem fonte fica fora', () => {
    render(<TalkXReportFunnel steps={semLink} segments={[]} segmentId={null} onSegmentChange={vi.fn()} />);

    expect(screen.getAllByTestId(/^funil-degrau-/)).toHaveLength(4);
    expect(screen.queryByTestId('funil-degrau-clicked')).toBeNull();
    expect(screen.queryByText(/Clicaram/)).toBeNull();
    expect(screen.getAllByRole('rowheader').map((el) => el.textContent)).toEqual(['Enviados', 'Entregues', 'Responderam', 'Converteram']);
    expect(talkxReportFunnelRows(semLink).map((r) => r.key)).toEqual(['sent', 'delivered', 'replied', 'converted']);
  });

  it('a largura de cada degrau é o % sobre os enviados', () => {
    render(<TalkXReportFunnel steps={comLink} segments={[]} segmentId={null} onSegmentChange={vi.fn()} />);

    expect(screen.getAllByTestId(/^funil-degrau-/).map((el) => el.getAttribute('data-pct'))).toEqual(['100.0', '96.4', '22.8', '15.4', '3.8']);
    expect(screen.getByTestId('funil-degrau-converted').getAttribute('points')).toBe('48.08,400 51.92,400 51.92,500 48.08,500');
    expect(screen.getByText('12.480 · 100% · Enviados')).toBeTruthy();
    expect(screen.getByText('12.032 · 96,4% · Entregues')).toBeTruthy();
    expect(screen.getByText('2.843 · 22,8% · Responderam')).toBeTruthy();
    expect(screen.getByText('478 · 3,8% · Converteram')).toBeTruthy();
    expect(talkxReportTrapezoidPoints(100, 96.4, 0)).toBe('0,0 100,0 98.2,100 1.8,100');
  });

  it('arredonda para uma casa ANTES de decidir a casa decimal: 99,96% vira "100%", não "100,0%"', () => {
    const quaseInteiro: TalkXReportFunnelStep[] = [
      { key: 'sent', count: 10000 },
      { key: 'delivered', count: 9996 },
      { key: 'replied', count: 4996 },
    ];
    render(<TalkXReportFunnel steps={quaseInteiro} segments={[]} segmentId={null} onSegmentChange={vi.fn()} />);

    // 9.996/10.000 = 99,96% e 4.996/10.000 = 49,96%: os dois viram inteiro depois do arredondamento.
    expect(screen.getByText('9.996 · 100% · Entregues')).toBeTruthy();
    expect(screen.getByText('4.996 · 50% · Responderam')).toBeTruthy();
    expect(screen.queryByText(/100,0%/)).toBeNull();
    expect(screen.queryByText(/50,0%/)).toBeNull();
  });

  it('seletor de segmento só aparece com mais de um segmento e devolve o id escolhido', () => {
    const onSegmentChange = vi.fn();
    const { rerender } = render(
      <TalkXReportFunnel steps={comLink} segments={[{ id: 's1', name: 'Base Geral' }]} segmentId={null} onSegmentChange={onSegmentChange} />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();

    rerender(
      <TalkXReportFunnel
        steps={comLink}
        segments={[{ id: 's1', name: 'VIP' }, { id: 's2', name: 'Recorrentes' }, { id: 's3', name: 'Base Geral' }]}
        segmentId={null}
        onSegmentChange={onSegmentChange}
      />,
    );

    abrirSelect();
    fireEvent.click(screen.getByRole('option', { name: 'Recorrentes' }));
    expect(onSegmentChange).toHaveBeenCalledWith('s2');

    rerender(
      <TalkXReportFunnel
        steps={comLink}
        segments={[{ id: 's1', name: 'VIP' }, { id: 's2', name: 'Recorrentes' }, { id: 's3', name: 'Base Geral' }]}
        segmentId="s1"
        onSegmentChange={onSegmentChange}
      />,
    );

    abrirSelect();
    fireEvent.click(screen.getByRole('option', { name: 'Todos os segmentos' }));
    expect(onSegmentChange).toHaveBeenCalledWith(null);
  });
});
