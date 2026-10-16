/**
 * X164 / TL-080 — "Desempenho da Campanha" (4 séries) da tela 14.
 *
 * Os rótulos de data são formatados no FUSO DA CAMPANHA (`schedule_timezone`), não no
 * fuso de quem abre a tela: a série do RPC já vem agrupada no dia/hora local da campanha.
 * Sem isso, um envio das 23h de São Paulo cai no dia seguinte para quem abre em UTC.
 */
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * As séries (e o tooltip) do Recharts animam por padrão e ignoram `prefers-reduced-motion`.
 * O gráfico é trocado por um registro das props de cada série (o jsdom não mede o
 * `ResponsiveContainer`, então o gráfico real não desenharia nada aqui de qualquer jeito).
 */
const seriesProps = vi.hoisted(() => [] as Array<{ kind: string; dataKey?: string; isAnimationActive?: boolean; contentStyle?: unknown }>);
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  const serie = (kind: string) => (props: { dataKey?: string; isAnimationActive?: boolean; contentStyle?: unknown }) => {
    seriesProps.push({ kind, dataKey: props.dataKey, isAnimationActive: props.isAnimationActive, contentStyle: props.contentStyle });
    return null;
  };
  const vazio = () => null;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ComposedChart: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
    CartesianGrid: vazio,
    XAxis: vazio,
    YAxis: vazio,
    Tooltip: serie('Tooltip'),
    Area: serie('Area'),
    Line: serie('Line'),
  };
});

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) usa a API.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { TalkXReportPerformance } from '../TalkXReportPerformance';
import { talkxReportAxisLabel, type TalkXReportSeriesPoint } from '../talkxReportCharts';

const FUSO = 'America/Sao_Paulo';

/** Série por hora: 14/09 23h em São Paulo = 15/09 02:00 em UTC. */
const porHora: TalkXReportSeriesPoint[] = [
  { bucket: '2026-09-15T02:00:00.000Z', sent: 120, delivered: 110, replied: 20, conversions: 4 },
];

/** Série diária do mock: 15/09 00:00 em São Paulo = 15/09 03:00 UTC. */
const porDia: TalkXReportSeriesPoint[] = [
  { bucket: '2026-09-15T03:00:00.000Z', sent: 1248, delivered: 1202, replied: 298, conversions: 52 },
  { bucket: '2026-09-16T03:00:00.000Z', sent: 980, delivered: 940, replied: 210, conversions: 31 },
];

function abrirSelect() {
  fireEvent.pointerDown(screen.getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

describe('TalkXReportPerformance (X164/TL-080)', () => {
  it('mostra a data/hora do fuso da campanha, não a do navegador', () => {
    const { rerender } = render(
      <TalkXReportPerformance series={porHora} granularity="hour" onGranularityChange={vi.fn()} timeZone={FUSO} hasConversionSource />,
    );

    // 15/09 02:00 UTC = 14/09 23h em São Paulo.
    expect(screen.getByText('14 de set de 2026, 23h')).toBeTruthy();

    // Mesma série, campanha em UTC: o mesmo instante tem de aparecer como 15/09 02h.
    rerender(<TalkXReportPerformance series={porHora} granularity="hour" onGranularityChange={vi.fn()} timeZone="UTC" hasConversionSource />);

    expect(screen.getByText('15 de set de 2026, 02h')).toBeTruthy();
    expect(screen.queryByText('14 de set de 2026, 23h')).toBeNull();

    expect(talkxReportAxisLabel('2026-09-15T02:00:00.000Z', 'hour', FUSO)).toBe('23h');
    expect(talkxReportAxisLabel('2026-09-15T02:00:00.000Z', 'hour', 'UTC')).toBe('02h');
    expect(talkxReportAxisLabel('2026-09-15T03:00:00.000Z', 'day', FUSO)).toBe('15/09');
  });

  it('trocar Diário por Por hora avisa o pai (que refaz a RPC com p_granularity)', () => {
    const onGranularityChange = vi.fn();
    render(<TalkXReportPerformance series={porDia} granularity="day" onGranularityChange={onGranularityChange} timeZone={FUSO} hasConversionSource />);

    expect(screen.getByRole('combobox').textContent).toContain('Diário');

    abrirSelect();
    fireEvent.click(screen.getByRole('option', { name: 'Por hora' }));

    expect(onGranularityChange).toHaveBeenCalledWith('hour');
  });

  it('campanha sem fonte de conversão não mostra a série nem a coluna Conversões', () => {
    const { rerender } = render(
      <TalkXReportPerformance series={porDia} granularity="day" onGranularityChange={vi.fn()} timeZone={FUSO} hasConversionSource={false} />,
    );

    expect(screen.getAllByText('Enviados').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entregues').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Respostas').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Conversões')).toHaveLength(0);
    expect(screen.queryByText('52')).toBeNull();

    rerender(<TalkXReportPerformance series={porDia} granularity="day" onGranularityChange={vi.fn()} timeZone={FUSO} hasConversionSource />);

    expect(screen.getAllByText('Conversões').length).toBeGreaterThan(0);
    expect(screen.getByText('15 de set de 2026')).toBeTruthy();
    expect(screen.getByText('52')).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
  });

  it('as 4 séries e o tooltip desenham sem animação, sem contentStyle próprio', () => {
    seriesProps.length = 0;
    render(<TalkXReportPerformance series={porDia} granularity="day" onGranularityChange={vi.fn()} timeZone={FUSO} hasConversionSource />);

    expect(seriesProps.map((p) => `${p.kind}:${p.dataKey ?? '-'}`)).toEqual([
      'Tooltip:-', 'Area:sent', 'Area:delivered', 'Line:replied', 'Line:conversions',
    ]);
    expect(seriesProps.every((p) => p.isAnimationActive === false)).toBe(true);
    expect(seriesProps.find((p) => p.kind === 'Tooltip')?.contentStyle).toBeUndefined();
  });

  it('sem série no período mostra o estado vazio e nenhum gráfico', () => {
    render(<TalkXReportPerformance series={[]} granularity="day" onGranularityChange={vi.fn()} timeZone={FUSO} hasConversionSource={false} />);

    expect(screen.getByText('Sem dados ainda')).toBeTruthy();
    expect(screen.getByTitle('Sem série de desempenho no período selecionado.')).toBeTruthy();
    expect(screen.queryAllByText('Enviados')).toHaveLength(0);
  });
});
