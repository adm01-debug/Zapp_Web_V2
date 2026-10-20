import { describe, expect, it } from 'vitest';
import { recentMinuteSeries, averageRatePerMinute, estimateMinutesToFinish } from '@/components/talkx/talkxRunningHistory';

const now = new Date('2026-10-05T12:00:30.000Z');
const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();

// R2-MOD-033: a série agrupava só minutos com evento (buckets esparsos) e o ritmo
// ignorava pausas. Agora os buckets são consecutivos (zeros incluídos) e o ritmo é a
// média dos últimos 10 minutos reais.
describe('recentMinuteSeries (R2-MOD-033)', () => {
  it('devolve buckets consecutivos incluindo minutos sem envio', () => {
    const series = recentMinuteSeries(
      [
        { sent_at: at(0), delivered_at: at(0) },
        { sent_at: at(0), delivered_at: null },
        { sent_at: at(5), delivered_at: null },
      ],
      { minutes: 10, now },
    );
    expect(series).toHaveLength(10);
    expect(series[9].Enviadas).toBe(2); // minuto atual
    expect(series[9].Entregues).toBe(1);
    expect(series[4].Enviadas).toBe(1); // 5 minutos atrás
    expect(series[8].Enviadas).toBe(0); // minuto vazio existe, com zero
    expect(series[0].Enviadas).toBe(0);
  });

  it('dez minutos sem envio resultam em ritmo zero (sem previsão otimista)', () => {
    const series = recentMinuteSeries([{ sent_at: at(45), delivered_at: null }], { minutes: 20, now });
    expect(averageRatePerMinute(series, 10)).toBe(0);
  });
});

describe('averageRatePerMinute (R2-MOD-033)', () => {
  it('usa os últimos 10 buckets reais no denominador (zeros incluídos)', () => {
    const series = recentMinuteSeries(
      Array.from({ length: 20 }, () => ({ sent_at: now.toISOString(), delivered_at: null })),
      { minutes: 10, now },
    );
    // 20 envios concentrados num minuto, média sobre 10 minutos = 2 msgs/min (não 20).
    expect(averageRatePerMinute(series, 10)).toBe(2);
  });

  it('série vazia → null', () => {
    expect(averageRatePerMinute([], 10)).toBeNull();
  });
});

// Recusa do item #135: o ETA podia receber ritmo 0 (dez minutos sem envio) e a
// previsão virava Infinity. Ritmo zero é "indisponível", nunca divisão por zero.
describe('estimateMinutesToFinish (recusa #135)', () => {
  it('ritmo zero deixa a previsão indisponível, sem Infinity', () => {
    expect(estimateMinutesToFinish(500, 0)).toBeNull();
    expect(estimateMinutesToFinish(500, 0)).not.toBe(Infinity);
  });

  it('ritmo ausente (null) deixa a previsão indisponível', () => {
    expect(estimateMinutesToFinish(500, null)).toBeNull();
  });

  it('ritmo medido em zero (10 min sem envio) resulta em previsão indisponível', () => {
    const series = recentMinuteSeries([{ sent_at: at(45), delivered_at: null }], { minutes: 20, now });
    const rate = averageRatePerMinute(series, 10);
    expect(rate).toBe(0);
    expect(estimateMinutesToFinish(500, rate)).toBeNull();
  });

  it('ritmo positivo arredonda para cima em minutos inteiros', () => {
    expect(estimateMinutesToFinish(100, 4)).toBe(25);
    expect(estimateMinutesToFinish(101, 4)).toBe(26);
  });

  it('nada pendente → indisponível', () => {
    expect(estimateMinutesToFinish(0, 4)).toBeNull();
  });
});
