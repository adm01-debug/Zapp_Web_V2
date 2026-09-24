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

  it('tempo médio de resposta hoje/ontem é MEDIANA (p50), não média (E18)', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    // "respondidas hoje" inclui a violada (tem first_response_at, só não bateu o SLA):
    // [60,90,120,180] ordenado, 4 valores -> mediana interpolada entre idx1(90) e idx2(120) = 105.
    expect(r.avgResponseToday).toBe(105);
    expect(r.avgResponseYesterday).toBe(150); // [100,200] -> mediana = média = 150
  });

  it('delta de resposta é null com <5 respostas em qualquer um dos dias (guarda de amostra mínima, E19)', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    // hoje só tem 4 respostas, ontem só 2 — ambos abaixo do mínimo de 5.
    expect(r.deltaResponsePct).toBeNull();
  });

  it('p90ResponseToday reflete o topo da distribuição de hoje, separado da mediana', () => {
    const r = aggregateDashboardKpi([], buildSla(), NOW);
    // [60,90,120,180], p90: idx = 0.9*3 = 2.7 -> interp entre idx2(120) e idx3(180) = 162.
    expect(r.p90ResponseToday).toBe(162);
  });

  it('delta de resolvidas SOME quando qualquer um dos dias tem <5 (guarda de amostra mínima, E19)', () => {
    const closures = {
      hoje: Array.from({ length: 3 }, () => ({ created_at: dayAt(0, 10) })),
      ontem: Array.from({ length: 8 }, () => ({ created_at: dayAt(1, 10) })),
    };
    const r = aggregateDashboardKpi([...closures.hoje, ...closures.ontem], [], NOW);
    expect(r.resolvedToday).toBe(3);
    expect(r.deltaResolvedPct).toBeNull(); // hoje tem só 3 (<5) — sem "-X% fantasma"
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
