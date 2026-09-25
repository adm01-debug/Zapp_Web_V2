import { describe, it, expect } from 'vitest';
import { aggregateDashboardKpi, type DashboardKpiRpcResult } from '../useDashboardKpi';

// A partir do E23, a RPC dashboard_kpi calcula no servidor: contagens por dia,
// mediana/p90 (percentile_cont) e os buckets de 3h — validado via SELECT manual
// antes do deploy (mesmo método do E22: resolvedToday/avgResponseToday/p90/
// slaBreachedToday bateram exatamente com o cálculo manual em produção). Isso não
// é mais coberto por vitest (SQL rodando em Postgres, não em JS). O que sobra
// client-side, e o que este arquivo testa, é só a aplicação do guard de amostra
// mínima (E19) sobre o resultado já agregado pela RPC.
//
// E44 (Fase 6) pede exatamente os casos que migraram pro SQL: 0 linhas, 1
// outlier de 10h, virada de dia, timezone SP. Verificados ao vivo contra a
// RPC em produção — ver supabase/tests/dashboard_kpi_edge_cases.sql (T1-T4).

function buildResult(overrides: Partial<DashboardKpiRpcResult> = {}): DashboardKpiRpcResult {
  return {
    resolvedToday: 0,
    resolvedYesterday: 0,
    resolvedHourly8: [0, 0, 0, 0, 0, 0, 0, 0],
    avgResponseToday: null,
    avgResponseYesterday: null,
    p90ResponseToday: null,
    responseHourly8: [0, 0, 0, 0, 0, 0, 0, 0],
    slaBreachedToday: 0,
    answeredTodayCount: 0,
    answeredYesterdayCount: 0,
    ...overrides,
  };
}

describe('aggregateDashboardKpi', () => {
  it('repassa contagens e buckets tal como vieram da RPC', () => {
    const r = aggregateDashboardKpi(
      buildResult({ resolvedToday: 15, resolvedYesterday: 10, resolvedHourly8: [1, 2, 3, 4, 5, 0, 0, 0], slaBreachedToday: 1 })
    );
    expect(r.resolvedToday).toBe(15);
    expect(r.resolvedYesterday).toBe(10);
    expect(r.resolvedHourly8).toEqual([1, 2, 3, 4, 5, 0, 0, 0]);
    expect(r.slaBreachedToday).toBe(1);
  });

  it('calcula delta percentual de resolvidas quando os 2 dias têm amostra >= 5 (E19)', () => {
    const r = aggregateDashboardKpi(buildResult({ resolvedToday: 15, resolvedYesterday: 10 }));
    expect(r.deltaResolvedPct).toBe(Math.round(((15 - 10) / 10) * 100));
  });

  it('delta de resolvidas é null quando ontem tem <5 (guarda de amostra mínima, E19)', () => {
    const r = aggregateDashboardKpi(buildResult({ resolvedToday: 15, resolvedYesterday: 3 }));
    expect(r.deltaResolvedPct).toBeNull();
  });

  it('delta de resolvidas é null quando hoje tem <5, mesmo com ontem >= 5 (E19)', () => {
    const r = aggregateDashboardKpi(buildResult({ resolvedToday: 3, resolvedYesterday: 8 }));
    expect(r.deltaResolvedPct).toBeNull();
  });

  it('delta é null quando ontem é zero (mesmo efeito da antiga divisão por zero evitada)', () => {
    const r = aggregateDashboardKpi(buildResult({ resolvedToday: 15, resolvedYesterday: 0 }));
    expect(r.deltaResolvedPct).toBeNull();
  });

  it('mediana/p90/hourly8 de resposta passam direto da RPC (mesmos nomes de campo de antes do E23)', () => {
    const r = aggregateDashboardKpi(
      buildResult({
        avgResponseToday: 105,
        avgResponseYesterday: 150,
        p90ResponseToday: 162,
        responseHourly8: [0, 0, 105, 0, 0, 0, 0, 0],
        answeredTodayCount: 4,
        answeredYesterdayCount: 2,
      })
    );
    expect(r.avgResponseToday).toBe(105);
    expect(r.avgResponseYesterday).toBe(150);
    expect(r.p90ResponseToday).toBe(162);
    expect(r.responseHourly8).toEqual([0, 0, 105, 0, 0, 0, 0, 0]);
  });

  it('delta de resposta é null com <5 respostas em qualquer um dos dias (guarda de amostra mínima, E19)', () => {
    const r = aggregateDashboardKpi(
      buildResult({ avgResponseToday: 105, avgResponseYesterday: 150, answeredTodayCount: 4, answeredYesterdayCount: 2 })
    );
    expect(r.deltaResponsePct).toBeNull();
  });

  it('calcula delta de resposta quando os 2 dias têm >= 5 respostas', () => {
    const r = aggregateDashboardKpi(
      buildResult({ avgResponseToday: 120, avgResponseYesterday: 150, answeredTodayCount: 6, answeredYesterdayCount: 7 })
    );
    expect(r.deltaResponsePct).toBe(Math.round(((120 - 150) / 150) * 100));
  });

  it('sem nenhuma resposta hoje/ontem, avgResponseToday/Yesterday e delta são null', () => {
    const r = aggregateDashboardKpi(buildResult());
    expect(r.avgResponseToday).toBeNull();
    expect(r.avgResponseYesterday).toBeNull();
    expect(r.deltaResponsePct).toBeNull();
  });

  it('slaBreachedToday passa direto (contagem já vem filtrada por hoje pela RPC)', () => {
    const r = aggregateDashboardKpi(buildResult({ slaBreachedToday: 1 }));
    expect(r.slaBreachedToday).toBe(1);
  });
});
