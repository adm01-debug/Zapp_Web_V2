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
    expect(kpi.deltaNovosPct).toBeNull(); // prev=1 < MIN_PREV 50 → null
  });

  it('deltaNovosPct = null quando prev < MIN_PREV 50', () => {
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

  it('separa fornecedores do total e calcula fornecedores30/deltaFornecedoresPct', () => {
    const rows = [
      row(5, 'fornecedor'), row(10, 'fornecedor'), // 2 fornecedores recentes
      row(40, 'fornecedor'), // 1 fornecedor período anterior
      row(5, 'cliente'), // não é fornecedor
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.fornecedoresTotal).toBe(3);
    expect(kpi.fornecedores30).toBe(2);
    expect(kpi.deltaFornecedoresPct).toBeNull(); // prev=1 < MIN_PREV 50 → null
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
      // 50 no período anterior: dias 30..58 (janela [30,60))
      ...Array.from({ length: 50 }, (_, i) => row(30 + (i % 29))),
      // 60 recentes (0..29, janela [0,30))
      ...Array.from({ length: 60 }, (_, i) => row(i % 29 + 1)),
    ];
    const kpi = aggregateKpi(rows, NOW);
    // novosPrev30 = 50 >= MIN_PREV(50) → deve retornar número
    expect(typeof kpi.deltaNovosPct).toBe('number');
  });

  it('deltaNovosPct é null quando prev = 49 (abaixo do mínimo)', () => {
    // 49 registros todos dentro da janela [30,60): 30+(i%30) produz valores 30..59
    const rows = [
      ...Array.from({ length: 49 }, (_, i) => row(30 + (i % 30))),
      row(5), // 1 recente
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.deltaNovosPct).toBeNull(); // prev=49 < 50 → null
  });

  it('dataset vazio não quebra e retorna séries zeradas', () => {
    const kpi = aggregateKpi([], NOW);
    expect(kpi.novos30).toBe(0);
    expect(kpi.empresasDistinct).toBe(0);
    expect(kpi.fornecedoresTotal).toBe(0);
    expect(kpi.seriesEmpresasWeekly12.every(v => v === 0)).toBe(true);
    expect(kpi.seriesFornecedoresWeekly12.every(v => v === 0)).toBe(true);
  });


  // ── Regressao: auditoria forense 2026-09-07 ──────────────────────────────────

  it('deltaTotalPct null quando novos30=total (base nova sem historico anterior)', () => {
    // 1.516 contatos todos nos ultimos 29 dias -- sem guard MIN_PREV seria +151500%
    const rows = Array.from({ length: 1516 }, (_, i) => row(i % 29));
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.deltaTotalPct).toBeNull();
    expect(kpi.deltaTotalPct === 151500).toBe(false);
  });

  it('empresasDistinct ignora capitalizacao (case-insensitive)', () => {
    const rows = [
      row(5, 'cliente', 'Empresa X'),
      row(6, 'cliente', 'empresa x'),
      row(7, 'cliente', 'EMPRESA X'),
      row(8, 'cliente', 'Globex'),
      row(9, 'cliente', null),
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.empresasDistinct).toBe(2); // empresa x + globex
  });

  it('deltaTotalPct e numero quando prevTotal >= 50 (MIN_PREV)', () => {
    // 100 antigos (31-60d) + 120 novos (1-29d) -> prevTotal = 220-120 = 100 >= 50
    const rows = [
      ...Array.from({ length: 100 }, (_, i) => row(31 + (i % 29))),
      ...Array.from({ length: 120 }, (_, i) => row((i % 29) + 1)),
    ];
    const kpi = aggregateKpi(rows, NOW);
    expect(typeof kpi.deltaTotalPct).toBe('number');
    expect(kpi.deltaTotalPct).toBe(120); // pct(220, 100) = +120%
  });

  it('empresasDistinct apara espaços nas pontas (Apple / apple / "Apple ")', () => {
    const rows = [
      row(1, 'cliente', 'Apple'), row(2, 'cliente', 'apple'),
      row(3, 'cliente', 'Apple '), row(4, 'cliente', 'Google'),
    ];
    expect(aggregateKpi(rows, NOW).empresasDistinct).toBe(2);
  });

  it('contato criado agora conta em novos30', () => {
    const rows = [{ created_at: NOW.toISOString(), contact_type: 'cliente', company: null }];
    expect(aggregateKpi(rows, NOW).novos30).toBe(1);
  });

  it('contato criado exatamente 30d atrás cai em novosPrev30 (fronteira exclusiva)', () => {
    const kpi = aggregateKpi([row(30)], NOW);
    expect(kpi.novos30).toBe(0);
    expect(kpi.novosPrev30).toBe(1);
  });

  it('último ponto da série cumulativa semanal = total de contatos', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => row(100 + i)),
      ...Array.from({ length: 12 }, (_, i) => row(i * 7 + 3)),
    ];
    expect(aggregateKpi(rows, NOW).seriesTotalCumulative12w[11]).toBe(rows.length);
  });
});
