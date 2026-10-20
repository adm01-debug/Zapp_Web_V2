import { describe, it, expect } from 'vitest';
import { aggregateKpi } from '@/hooks/crm/useContactsKpi';

const DAY = 86_400_000;
const NOW = new Date('2026-09-08T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const row = (d: number, type = 'cliente', company: string | null = null) => ({
  created_at: daysAgo(d), contact_type: type, company,
});

// ── DB-02 Regressão: empresasDistinct case-insensitive ───────────────────────
describe('aggregateKpi — empresasDistinct', () => {
  it('conta Apple/apple/APPLE como 1 empresa (regressão DB-02)', () => {
    const kpi = aggregateKpi([
      row(1, 'cliente', 'Apple'), row(2, 'cliente', 'apple'),
      row(3, 'cliente', 'APPLE'), row(4, 'cliente', 'Apple '),
      row(5, 'cliente', 'Google'),
    ], NOW);
    expect(kpi.empresasDistinct).toBe(2);
  });

  it('ignora null, vazio e whitespace-only', () => {
    const kpi = aggregateKpi([
      row(1, 'cliente', null), row(2, 'cliente', ''),
      row(3, 'cliente', '   '), row(4, 'cliente', 'Empresa A'),
    ], NOW);
    expect(kpi.empresasDistinct).toBe(1);
  });

  it('Petrobras/PETROBRAS/petrobras = 1 empresa', () => {
    const kpi = aggregateKpi([
      row(1, 'cliente', 'Petrobras'), row(2, 'cliente', 'PETROBRAS'),
      row(3, 'cliente', 'petrobras'), row(4, 'cliente', 'Embraer'),
    ], NOW);
    expect(kpi.empresasDistinct).toBe(2);
  });

  it('base vazia retorna 0', () => {
    expect(aggregateKpi([], NOW).empresasDistinct).toBe(0);
  });
});

// ── novos30 e bucket7 ────────────────────────────────────────────────────────
describe('aggregateKpi — novos30 e bucket7', () => {
  it('bucket7 sum === novos30 (cobertura total 30 dias)', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i, 'cliente', 'X'));
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.seriesNovosDaily30.reduce((a, b) => a + b, 0)).toBe(kpi.novos30);
    expect(kpi.seriesNovosDaily30).toHaveLength(7);
  });

  it('contato criado agora é novos30', () => {
    const rows = [{ created_at: NOW.toISOString(), contact_type: 'cliente', company: null }];
    expect(aggregateKpi(rows, NOW).novos30).toBe(1);
  });

  it('contato criado exatamente 30d atrás NÃO é novos30 (boundary exclusivo)', () => {
    const rows = [{ created_at: new Date(NOW.getTime() - 30 * DAY).toISOString(), contact_type: 'c', company: null }];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.novos30).toBe(0);
    expect(kpi.novosPrev30).toBe(1);
  });
});

// ── leads ────────────────────────────────────────────────────────────────────
describe('aggregateKpi — leads', () => {
  it('conta só contact_type=lead', () => {
    const kpi = aggregateKpi([
      row(1, 'lead'), row(2, 'cliente'), row(3, 'fornecedor'),
      row(4, 'lead'), row(5, null as unknown as string),
    ], NOW);
    expect(kpi.leadsTotal).toBe(2);
  });
});

// ── cumulative series ────────────────────────────────────────────────────────
describe('aggregateKpi — seriesTotalCumulative12w', () => {
  it('série tem comprimento 12', () => {
    expect(aggregateKpi([], NOW).seriesTotalCumulative12w).toHaveLength(12);
  });

  it('último elemento = total de contatos', () => {
    const old = Array.from({ length: 5 }, (_, i) => row(100 + i));
    const weekly = Array.from({ length: 12 }, (_, i) => row(i * 7 + 3));
    const rows = [...old, ...weekly];
    const kpi = aggregateKpi(rows, NOW);
    expect(kpi.seriesTotalCumulative12w[11]).toBe(rows.length);
  });
});

// ── deltaNovosPct MIN_PREV ────────────────────────────────────────────────────
describe('aggregateKpi — deltaNovosPct', () => {
  it('null quando período anterior < MIN_PREV', () => {
    const prev = Array.from({ length: 49 }, (_, i) => row(31 + i));
    const curr = Array.from({ length: 10 }, (_, i) => row(i + 1));
    const kpi = aggregateKpi([...prev, ...curr], NOW);
    expect(kpi.deltaNovosPct).toBeNull();
  });
});
