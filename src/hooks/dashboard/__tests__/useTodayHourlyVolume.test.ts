import { describe, it, expect } from 'vitest';
import { aggregateTodayHourlyVolume } from '../useTodayHourlyVolume';

const NOW = new Date(2026, 5, 15, 10, 30, 0); // hoje 15/06, hora atual = 10

function at(daysAgo: number, hour: number) {
  return new Date(2026, 5, 15 - daysAgo, hour, 0, 0).toISOString();
}

describe('aggregateTodayHourlyVolume', () => {
  it('todayByHour: horas futuras (> hora atual) ficam null, passadas começam em 0/contagem real', () => {
    const rows = [{ created_at: at(0, 8) }, { created_at: at(0, 8) }, { created_at: at(0, 10) }];
    const r = aggregateTodayHourlyVolume(rows, NOW);
    expect(r.todayByHour).toHaveLength(24);
    expect(r.todayByHour[8]).toBe(2);
    expect(r.todayByHour[10]).toBe(1);
    expect(r.todayByHour[9]).toBe(0);
    expect(r.todayByHour[11]).toBeNull();
    expect(r.todayByHour[23]).toBeNull();
  });

  it('currentHourCount reflete a hora atual de hoje', () => {
    const rows = [{ created_at: at(0, 10) }, { created_at: at(0, 10) }, { created_at: at(0, 10) }];
    const r = aggregateTodayHourlyVolume(rows, NOW);
    expect(r.currentHour).toBe(10);
    expect(r.currentHourCount).toBe(3);
  });

  it('last7ByDay tem 7 dias incluindo hoje, com contagem por dia', () => {
    const rows = [{ created_at: at(0, 8) }, { created_at: at(1, 8) }, { created_at: at(1, 9) }, { created_at: at(6, 8) }];
    const r = aggregateTodayHourlyVolume(rows, NOW);
    expect(r.last7ByDay).toHaveLength(7);
    expect(r.last7ByDay[6].count).toBe(1); // hoje
    expect(r.last7ByDay[5].count).toBe(2); // ontem
    expect(r.last7ByDay[0].count).toBe(1); // 6 dias atrás
  });

  it('avg7dCurrentHour: média da mesma hora (10h) nos 7 dias anteriores, hoje excluído', () => {
    const rows = [
      { created_at: at(1, 10) }, { created_at: at(1, 10) }, // ontem às 10h: 2
      { created_at: at(2, 10) }, // anteontem às 10h: 1
      { created_at: at(0, 10) }, // hoje às 10h — não deve entrar na média
    ];
    const r = aggregateTodayHourlyVolume(rows, NOW);
    // soma 3 ao longo de 7 dias anteriores (5 dias com 0) = 3/7 ≈ 0.4
    expect(r.avg7dCurrentHour).toBeCloseTo(3 / 7, 1);
  });

  it('sem nenhuma mensagem, todayByHour todo 0/null e avg7dCurrentHour 0', () => {
    const r = aggregateTodayHourlyVolume([], NOW);
    expect(r.todayByHour.slice(0, 11)).toEqual(Array(11).fill(0));
    expect(r.avg7dCurrentHour).toBe(0);
  });
});
