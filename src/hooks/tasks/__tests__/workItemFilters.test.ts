import { describe, it, expect } from 'vitest';
import { DEFAULT_FILTERS, filtersFromSearch, isFilterActive, searchWithFilters } from '../workItemFilters';

/** Etapa 45: o estado da barra de filtros mora na URL — estas são as regras do
 *  parse e do serialize, provadas sem React. */
describe('etapa 45 — filtros: URL e "tem filtro ativo"', () => {
  it('lê os parâmetros do plano da query string', () => {
    expect(filtersFromSearch('?q=liga&prio=urgent&contact=c1&alarm=1&done=0')).toEqual({
      q: 'liga', prio: 'urgent', contact: 'c1', alarm: true, done: false,
    });
  });

  it('sem parâmetros, cai no padrão do módulo (concluídas visíveis)', () => {
    expect(filtersFromSearch('')).toEqual(DEFAULT_FILTERS);
  });

  it('ignora prioridade fora da lista e contato vazio', () => {
    expect(filtersFromSearch('?prio=xxx&contact=')).toEqual(DEFAULT_FILTERS);
  });

  it('escreve só o que difere do padrão e preserva o resto da URL (view); q nao vai para a URL', () => {
    const qs = searchWithFilters('?view=tasks&alarm=1', {
      ...DEFAULT_FILTERS, q: 'liga', prio: 'high', done: false,
    });
    const p = new URLSearchParams(qs);

    expect(p.get('view')).toBe('tasks');
    expect(p.get('q')).toBeNull();
    expect(p.get('prio')).toBe('high');
    expect(p.get('done')).toBe('0');
    // o alarme saiu porque voltou ao padrão (desligado)
    expect(p.get('alarm')).toBeNull();
  });

  it('"limpar" devolve a URL sem parâmetro de filtro', () => {
    expect(searchWithFilters('?view=tasks&prio=low', DEFAULT_FILTERS)).toBe('?view=tasks');
  });

  it('isFilterActive ignora o estado padrão e a busca só de espaços', () => {
    expect(isFilterActive(DEFAULT_FILTERS)).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTERS, q: '   ' })).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTERS, alarm: true })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTERS, done: false })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTERS, prio: 'low' })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTERS, contact: 'c1' })).toBe(true);
  });

  it('ida e volta: o que escreve, lê de volta (q nao vai para a URL)', () => {
    const filtros = { prio: 'medium' as const, contact: 'c9', alarm: true, done: false };
    const comQ = { q: 'orçamento', ...filtros };
    const resultado = filtersFromSearch(searchWithFilters('', comQ));
    // q nao vai para a URL, entao nao e preservado no round-trip
    expect(resultado.q).toBe('');
    expect(resultado.prio).toBe('medium');
    expect(resultado.contact).toBe('c9');
    expect(resultado.alarm).toBe(true);
    expect(resultado.done).toBe(false);
  });

  it('o texto de busca nao vai para a URL; demais filtros continuam espelhados', () => {
    const qs = searchWithFilters('?view=tasks', { ...DEFAULT_FILTERS, q: 'liga', prio: 'high' });
    const p = new URLSearchParams(qs);
    expect(p.get('q')).toBeNull();
    expect(p.get('prio')).toBe('high');
    expect(p.get('view')).toBe('tasks');
  });
});
