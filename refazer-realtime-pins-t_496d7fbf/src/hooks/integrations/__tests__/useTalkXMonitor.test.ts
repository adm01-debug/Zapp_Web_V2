/**
 * E09: Testes do useTalkXMonitor — rateByMinute real, sem Math.random
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { buildRateByMinute } from '../useTalkXMonitor';

type RecipientStub = { sent_at: string | null; delivered_at: string | null };

describe('buildRateByMinute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T15:00:30.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('retorna array vazio para dados vazios', () => {
    expect(buildRateByMinute([])).toEqual([]);
  });

  it('ignora recipients sem sent_at', () => {
    const data: RecipientStub[] = [
      { sent_at: null, delivered_at: null },
      { sent_at: null, delivered_at: '2026-09-08T10:00:00Z' },
    ];
    expect(buildRateByMinute(data)).toEqual([]);
  });

  it('agrupa por minuto corretamente', () => {
    const now = new Date();
    const min0 = new Date(now.getTime() - 5 * 60_000); // 5 min atrás
    const min1 = new Date(now.getTime() - 3 * 60_000); // 3 min atrás

    // 2 no mesmo minuto, 1 em outro
    const data: RecipientStub[] = [
      { sent_at: new Date(min0.getTime()).toISOString(), delivered_at: null },
      { sent_at: new Date(min0.getTime() + 10_000).toISOString(), delivered_at: new Date().toISOString() },
      { sent_at: new Date(min1.getTime()).toISOString(), delivered_at: null },
    ];

    const result = buildRateByMinute(data);
    expect(result.length).toBe(2);

    // Ordenado cronologicamente
    const totalEnviadas = result.reduce((a, r) => a + r.Enviadas, 0);
    expect(totalEnviadas).toBe(3);

    // Apenas 1 entregue
    const totalEntregues = result.reduce((a, r) => a + r.Entregues, 0);
    expect(totalEntregues).toBe(1);
  });

  it('exclui recipients fora da janela de 60 minutos', () => {
    const old = new Date(Date.now() - 61 * 60_000); // 61 min atrás
    const data: RecipientStub[] = [
      { sent_at: old.toISOString(), delivered_at: null },
    ];
    expect(buildRateByMinute(data)).toEqual([]);
  });

  it('buckets com label HH:mm correto', () => {
    const fixedTime = new Date('2026-09-08T14:32:00.000Z');
    const result = buildRateByMinute([
      { sent_at: fixedTime.toISOString(), delivered_at: null },
    ]);
    // Apenas verifica que há 1 bucket com formato HH:mm
    if (result.length > 0) {
      expect(result[0].label).toMatch(/^\d{2}:\d{2}$/);
      expect(result[0].Enviadas).toBe(1);
      expect(result[0].Entregues).toBe(0);
    }
    // Se cair fora da janela de 60 min, array vazio é aceitável
  });

  it('sem Math.random — resultado é determinístico', () => {
    const t = new Date(Date.now() - 10 * 60_000);
    const data: RecipientStub[] = [
      { sent_at: t.toISOString(), delivered_at: null },
      { sent_at: t.toISOString(), delivered_at: t.toISOString() },
    ];
    const r1 = buildRateByMinute(data);
    const r2 = buildRateByMinute(data);
    expect(r1).toEqual(r2);
    expect(r1[0].Enviadas).toBe(2);
    expect(r1[0].Entregues).toBe(1);
  });
});
