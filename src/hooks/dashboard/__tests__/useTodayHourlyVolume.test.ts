// O agregador lê hoje/hora no fuso do APP (America/Sao_Paulo), não no do dispositivo
// (R2-MOD-075). TZ forçado a UTC para o resultado ser o mesmo em qualquer máquina de CI:
// sem isso o teste passaria por acidente num host em São Paulo e quebraria em UTC.
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { aggregateHourlyVolume } from '../useTodayHourlyVolume';

// 2026-06-15T13:30Z = 15/06 10:30 em São Paulo → hora corrente do app = 10.
const NOW = new Date('2026-06-15T13:30:00.000Z');

function bucket(daysAgo: number, hour: number, message_count: number) {
  // 15/06 00:00 em São Paulo = 03:00Z; subtrair dias inteiros mantém a data de calendário de SP.
  const baseSp = Date.UTC(2026, 5, 15, 3, 0, 0);
  const d = new Date(baseSp - daysAgo * 86_400_000);
  return { day: d.toISOString().slice(0, 10), hour, message_count };
}

describe('aggregateHourlyVolume', () => {
  it('todayByHour: horas futuras (> hora atual) ficam null, passadas começam em 0/contagem real', () => {
    const buckets = [bucket(0, 8, 2), bucket(0, 10, 1)];
    const r = aggregateHourlyVolume(buckets, NOW);
    expect(r.todayByHour).toHaveLength(24);
    expect(r.todayByHour[8]).toBe(2);
    expect(r.todayByHour[10]).toBe(1);
    expect(r.todayByHour[9]).toBe(0);
    expect(r.todayByHour[11]).toBeNull();
    expect(r.todayByHour[23]).toBeNull();
  });

  it('currentHourCount reflete a hora atual de hoje', () => {
    const buckets = [bucket(0, 10, 3)];
    const r = aggregateHourlyVolume(buckets, NOW);
    expect(r.currentHour).toBe(10);
    expect(r.currentHourCount).toBe(3);
  });

  it('last7ByDay tem 7 dias incluindo hoje, com contagem por dia', () => {
    const buckets = [bucket(0, 8, 1), bucket(1, 8, 1), bucket(1, 9, 1), bucket(6, 8, 1)];
    const r = aggregateHourlyVolume(buckets, NOW);
    expect(r.last7ByDay).toHaveLength(7);
    expect(r.last7ByDay[6].count).toBe(1); // hoje
    expect(r.last7ByDay[5].count).toBe(2); // ontem (2 buckets somados)
    expect(r.last7ByDay[0].count).toBe(1); // 6 dias atrás
  });

  it('avg7dCurrentHour: média da mesma hora (10h) nos 7 dias anteriores, hoje excluído', () => {
    const buckets = [
      bucket(1, 10, 2), // ontem às 10h: 2
      bucket(2, 10, 1), // anteontem às 10h: 1
      bucket(0, 10, 1), // hoje às 10h — não deve entrar na média
    ];
    const r = aggregateHourlyVolume(buckets, NOW);
    // soma 3 ao longo de 7 dias anteriores (5 dias com 0) = 3/7 ≈ 0.4
    expect(r.avg7dCurrentHour).toBeCloseTo(3 / 7, 1);
  });

  it('sem nenhum bucket, todayByHour todo 0/null e avg7dCurrentHour 0', () => {
    const r = aggregateHourlyVolume([], NOW);
    expect(r.todayByHour.slice(0, 11)).toEqual(Array(11).fill(0));
    expect(r.avg7dCurrentHour).toBe(0);
  });
});
