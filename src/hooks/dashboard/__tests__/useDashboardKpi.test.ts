import { describe, it, expect } from 'vitest';
import { aggregateDashboardKpi } from '../useDashboardKpi';

// now fixo às 15:00 do dia do teste — evita flakiness por hora do relógio real.
const NOW = new Date(2026, 5, 15, 15, 0, 0);
const dayAt = (daysAgo: number, hour: number) => new Date(2026, 5, 15 - daysAgo, hour, 0, 0).toISOString();

function buildClosures() {
  // 15 hoje, 10 ontem, 5 anteontem — 30 linhas sintéticas (etapa 41).
  const hoje = Array.from({ length: 15 }, (_, i) => ({ created_at: dayAt(0, i % 24) }));
  const ontem = Array.from({ length: 10 }, (_, i) => ({ created_at: dayAt(1, i % 24) }));
  const anteontem = Array.from({ length: 5 }, (_, i) => ({ created_at: dayAt(2, i % 24) }));
  return { hoje, ontem, anteontem, all: [...hoje, ...ontem, ...anteontem] };
}

function buildSla() {
  // 3 respondidas hoje (60s, 120s, 180s -> média 120s), 2 ontem (100s, 200s -> média 150s),
  // 1 sem resposta hoje, 1 violada hoje, 1 anteontem (fora da janela hoje/ontem).
  return [
    { first_message_at: dayAt(0, 8), first_response_at: new Date(new Date(dayAt(0, 8)).getTime() + 60_000).toISOString(), first_response_breached: false },
    { first_message_at: dayAt(0, 9), first_response_at: new Date(new Date(dayAt(0, 9)).getTime() + 120_000).toISOString(), first_response_breached: false },
    { first_message_at: dayAt(0, 10), first_response_at: new Date(new Date(dayAt(0, 10)).getTime() + 180_000).toISOString(), first_response_breached: false },
    { first_message_at: dayAt(1, 8), first_response_at: new Date(new Date(dayAt(1, 8)).getTime() + 100_000).toISOString(), first_response_breached: false },
    { first_message_at: dayAt(1, 9), first_response_at: new Date(new Date(dayAt(1, 9)).getTime() + 200_000).toISOString(), first_response_breached: false },
    { first_message_at: dayAt(0, 11), first_response_at: null, first_response_breached: null },
    { first_message_at: dayAt(0, 12), first_response_at: new Date(new Date(dayAt(0, 12)).getTime() + 90_000).toISOString(), first_response_breached: true },
    { first_message_at: dayAt(2, 8), first_response_at: new Date(new Date(dayAt(2, 8)).getTime() + 50_000).toISOString(), first_response_breached: false },
  ];
}

describe('aggregateDashboardKpi', () => {
  it('conta resolvidas hoje/ontem e ignora anteontem', () => {
    const { all } = buildClosures();
    const r = aggregateDashboardKpi(all, [], NOW);
    expect(r.resolvedToday).toBe(15);
    expect(r.resolvedYesterday).toBe(10);
  });

  it('calcula delta percentual hoje vs ontem', () => {
    const { all } = buildClosures();
    const r = aggregateDashboardKpi(all, [], NOW);
    expect(r.deltaResolvedPct).toBe(Math.round(((15 - 10) / 10) * 100));
  });

  it('delta é null quando ontem for zero (divisão por zero evitada)', () => {
    const { hoje } = buildClosures();
    const r = aggregateDashboardKpi(hoje, [], NOW);
    expect(r.resolvedYesterday).toBe(0);
    expect(r.deltaResolvedPct).toBeNull();
  });

  it('resolvedHourly8 tem 8 buckets e soma bate com o total de hoje', () => {
    const { all } = buildClosures();
    const r = aggregateDashboardKpi(all, [], NOW);
    expect(r.resolvedHourly8).toHaveLength(8);
    expect(r.resolvedHourly8.reduce((a, b) => a + b, 0)).toBe(15);
  });

  it('tempo médio de resposta hoje/ontem e delta (invert: menor é melhor)', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    // "respondidas hoje" inclui a violada (tem first_response_at, só não bateu o SLA): 60+120+180+90 / 4
    expect(r.avgResponseToday).toBe(113);
    expect(r.avgResponseYesterday).toBe(150); // (100+200)/2
    expect(r.deltaResponsePct).toBe(Math.round(((113 - 150) / 150) * 100)); // negativo = melhorou
  });

  it('slaBreachedToday conta só as violadas hoje, ignora ontem/anteontem', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    expect(r.slaBreachedToday).toBe(1);
  });

  it('responseHourly8 tem 8 buckets, valores derivados só das respostas de hoje', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    expect(r.responseHourly8).toHaveLength(8);
    expect(r.responseHourly8.some((v) => v > 0)).toBe(true);
  });

  it('sem nenhuma resposta hoje/ontem, avgResponseToday/Yesterday e delta são null', () => {
    const r = aggregateDashboardKpi([], [], NOW);
    expect(r.avgResponseToday).toBeNull();
    expect(r.avgResponseYesterday).toBeNull();
    expect(r.deltaResponsePct).toBeNull();
  });
});
