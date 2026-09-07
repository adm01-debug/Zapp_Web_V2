import { describe, it, expect } from 'vitest';
import { aggregateKpi } from '../useContactsKpi';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function row(daysOld: number, contact_type: string | null = 'cliente', company: string | null = 'Acme') {
  return { created_at: daysAgo(daysOld), contact_type, company };
}

describe('aggregateKpi', () => {
  it('conta novos30 e novosPrev30 corretamente e calcula o delta', () => {
    const rows = [
      row(5), row(10), row(15), // 3 nos últimos 30 dias
      row(40), // 1 no período anterior (30-60)
      row(100), // fora das duas janelas
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.novos30).toBe(3);
    expect(kpi.novosPrev30).toBe(1);
    expect(kpi.deltaNovosPct).toBeNull(); // prev=1 < MIN_PREV(50) → null
  });

  it('deltaNovosPct = null quando prev < MIN_PREV(50)', () => {
    const rows = [row(5)];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.deltaNovosPct).toBeNull(); // prev=0 < 50 → null
  });

  it('deltaNovosPct = null quando não há registros em nenhuma janela e prev < 50', () => {
    const rows = [row(200)];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.deltaNovosPct).toBeNull(); // prev=0 < 50 → null
  });

  it('conta empresas distintas ignorando vazio/duplicado', () => {
    const rows = [
      row(5, 'cliente', 'Acme'),
      row(6, 'cliente', 'Acme'),
      row(7, 'cliente', 'Globex'),
      row(8, 'cliente', null),
      row(9, 'cliente', '  '),
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.empresasDistinct).toBe(2);
  });

  it('separa leads do total e calcula leads30/deltaLeadsPct', () => {
    const rows = [
      row(5, 'lead'), row(10, 'lead'), // 2 leads recentes
      row(40, 'lead'), // 1 lead período anterior
      row(5, 'cliente'), // não é lead
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.leadsTotal).toBe(3);
    expect(kpi.leads30).toBe(2);
    expect(kpi.deltaLeadsPct).toBeNull(); // prev=1 < MIN_PREV(50) → null
  });

  it('sparkline diária (7 buckets) soma 30 pontos sem perder registros', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i));
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.seriesNovosDaily30).toHaveLength(7);
    expect(kpi.seriesNovosDaily30.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('série cumulativa semanal (12 semanas) é não decrescente', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i * 5));
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.seriesTotalCumulative12w).toHaveLength(12);
    for (let i = 1; i < kpi.seriesTotalCumulative12w.length; i++) {
      expect(kpi.seriesTotalCumulative12w[i]).toBeGreaterThanOrEqual(kpi.seriesTotalCumulative12w[i - 1]);
    }
  });

  
  it('deltaNovosPct é número quando prev >= MIN_PREV (50)', () => {
    const rows = [
      // 50 no período anterior: dias 30-58 (todos dentro da janela [30,60))
      ...Array.from({ length: 50 }, (_, i) => row(30 + (i % 29))),
      // 60 recentes (dentro de 30 dias)
      ...Array.from({ length: 60 }, (_, i) => row(i % 29 + 1)),
    ];
    const kpi = aggregateKpi(rows, NOW);
    // novosPrev30 = 50 >= MIN_PREV(50) → deve retornar número
    expect(typeof kpi.deltaNovosPct).toBe('number');
  });

  it('deltaNovosPct é null quando prev = 49 (abaixo do mínimo)', () => {
    const rows = [
      ...Array.from({ length: 49 }, (_, i) => row(31 + i)),
      row(5), // 1 recente
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.deltaNovosPct).toBeNull(); // prev=49 < 50 → null
  });

  it('dataset vazio não quebra e retorna séries zeradas', () => {
    const kpi = aggregateKpi([], NOW);
    expect(kpi.novos30).toBe(0);
    expect(kpi.empresasDistinct).toBe(0);
    expect(kpi.leadsTotal).toBe(0);
    expect(kpi.seriesEmpresasWeekly12.every(v => v === 0)).toBe(true);
    expect(kpi.seriesLeadsWeekly12.every(v => v === 0)).toBe(true);
  });
});
