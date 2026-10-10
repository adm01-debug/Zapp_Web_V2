// R2-MOD-075 — o agregador do Volume por hora tem de usar o fuso do APP
// (America/Sao_Paulo), o mesmo em que a RPC dashboard_hourly_volume já derivou
// as chaves `day`/`hour`. Com os getters locais (startOfDay/format/getHours) o
// mesmo instante e os mesmos buckets produziam recortes diferentes conforme o
// fuso do dispositivo.
//
// TZ forçado a UTC de propósito: é o cenário em que o defeito aparece; se o
// teste dependesse do fuso da máquina ele passaria por acidente em São Paulo.
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { aggregateHourlyVolume } from '../useTodayHourlyVolume';

// 2026-10-04T01:30Z = 2026-10-03 22:30 em America/Sao_Paulo (UTC-3).
// O bucket corrente de São Paulo é 2026-10-03/22.
const NOW = new Date('2026-10-04T01:30:00.000Z');

describe('aggregateHourlyVolume — fuso do app (R2-MOD-075)', () => {
  it('reconhece o bucket corrente de São Paulo em vez do dia/hora do dispositivo', () => {
    const buckets = [{ day: '2026-10-03', hour: 22, message_count: 4 }];
    const r = aggregateHourlyVolume(buckets, NOW);

    expect(r.currentHour).toBe(22);
    expect(r.currentHourCount).toBe(4);
    expect(r.todayByHour[22]).toBe(4);
    expect(r.todayByHour[23]).toBeNull();
  });

  it('ancora a série de 7 dias no dia de calendário de São Paulo (não migra para ontem)', () => {
    const buckets = [{ day: '2026-10-03', hour: 22, message_count: 4 }];
    const r = aggregateHourlyVolume(buckets, NOW);

    expect(r.last7ByDay).toHaveLength(7);
    expect(r.last7ByDay.map((d) => d.date)).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
      '2026-10-01', '2026-10-02', '2026-10-03',
    ]);
    expect(r.last7ByDay[6]).toEqual({ date: '2026-10-03', count: 4 });
    expect(r.last7ByDay.reduce((acc, d) => acc + d.count, 0)).toBe(4);
  });

  it('média dos 7 dias anteriores usa a hora corrente de São Paulo', () => {
    const buckets = [
      { day: '2026-10-02', hour: 22, message_count: 3 }, // ontem às 22h (SP)
      { day: '2026-10-03', hour: 22, message_count: 4 }, // hoje às 22h — fora da média
    ];
    const r = aggregateHourlyVolume(buckets, NOW);

    // a média é arredondada a 1 casa pelo próprio agregador: Math.round((3/7)*10)/10 = 0,4
    expect(r.avg7dCurrentHour).toBe(0.4);
  });
});
