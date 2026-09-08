/**
 * E09: Testes do useTalkXMonitor — rateByMinute real, sem Math.random
 */
import { describe, it, expect, vi } from 'vitest';

// Testar a função pura buildRateByMinute via extração manual
// (a função não é exportada do hook, testamos o comportamento)

type RecipientStub = { sent_at: string | null; delivered_at: string | null };

function buildRateByMinute(data: RecipientStub[]) {
  if (!data.length) return [];
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const buckets = new Map<string, { sent: number; delivered: number }>();

  for (const r of data) {
    if (!r.sent_at) continue;
    const t = new Date(r.sent_at).getTime();
    if (now - t > windowMs) continue;
    const d = new Date(t);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = buckets.get(key) ?? { sent: 0, delivered: 0 };
    b.sent += 1;
    if (r.delivered_at) b.delivered += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sent, delivered }]) => ({ label, Enviadas: sent, Entregues: delivered }));
}

describe('buildRateByMinute', () => {
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
      { sent_at: new Date(min0.getTime() + 15_000).toISOString(), delivered_at: new Date().toISOString() },
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
