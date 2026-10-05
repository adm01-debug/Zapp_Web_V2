import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { npsTimelineByDay, buildEvolutionSeries } from '../satisfaction-series';

// DASH-CONTROLS-001 (ponto 2): prova que a série NPS existe e respeita o
// período — antes o gráfico desenhava CSAT mesmo com "CSAT e NPS" selecionado.

const NOW = new Date('2026-10-05T15:00:00').getTime();
const dia = (offset: number) => {
  const d = new Date(NOW - offset * 86400000);
  return { iso: d.toISOString(), label: format(d, 'dd/MM') };
};

describe('npsTimelineByDay', () => {
  it('calcula NPS por dia: (promotores − detratores)/total × 100', () => {
    const d1 = dia(1);
    const out = npsTimelineByDay([
      { created_at: d1.iso, score: 10 }, // promotor
      { created_at: d1.iso, score: 9 },  // promotor
      { created_at: d1.iso, score: 5 },  // detrator
      { created_at: d1.iso, score: 8 },  // neutro
    ], 30, NOW);
    // (2 − 1) / 4 = 25
    expect(out.get(d1.label)).toBe(25);
  });

  it('dia só com detratores dá NPS negativo (−100), que precisa caber no eixo', () => {
    const d1 = dia(1);
    const out = npsTimelineByDay([
      { created_at: d1.iso, score: 0 },
      { created_at: d1.iso, score: 6 },
    ], 30, NOW);
    expect(out.get(d1.label)).toBe(-100);
  });

  it('ignora surveys fora da janela e dias sem resposta ficam fora do mapa', () => {
    const d40 = dia(40);
    const out = npsTimelineByDay([{ created_at: d40.iso, score: 10 }], 30, NOW);
    expect(out.size).toBe(0);
    expect(out.get(dia(1).label)).toBeUndefined();
  });
});

describe('buildEvolutionSeries', () => {
  it('cada ponto carrega CSAT e NPS; ausência é null, nunca 0', () => {
    const d1 = dia(1).label;
    const d2 = dia(2).label;
    const series = buildEvolutionSeries(
      [
        { date: d2, csatPercent: 80.4 },
        { date: d1, csatPercent: null },
      ],
      new Map([[d1, 50]]),
    );
    expect(series).toEqual([
      { date: d2, CSAT: 80, NPS: null },
      { date: d1, CSAT: null, NPS: 50 },
    ]);
  });
});
