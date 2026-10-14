import { describe, expect, it } from 'vitest';
import {
  SLA_RISK_STATUSES,
  SLA_TIMELINE_FILTERS_STORAGE_KEY,
  defaultSlaTimelineFilters,
  isRiskOnlyFilter,
  loadSlaTimelineFilters,
  saveSlaTimelineFilters,
  toSlaTimelineFilters,
  toggleRiskOnlyFilter,
  type SlaTimelineFilterSelection,
} from '../slaTimelineFilterState';

/** Storage em memória — nada de tocar o `localStorage` real do jsdom entre casos. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** Storage que explode em tudo — modo privado/cota cheia/storage desabilitado. */
const storageQueExplode = {
  getItem() {
    throw new Error('bloqueado');
  },
  setItem() {
    throw new Error('cota cheia');
  },
  removeItem() {
    throw new Error('bloqueado');
  },
  clear() {
    throw new Error('bloqueado');
  },
  key() {
    throw new Error('bloqueado');
  },
  length: 0,
} as unknown as Storage;

describe('slaTimelineFilterState — memória da seleção', () => {
  it('sem preferência salva, nasce aberto (tudo, todas as situações)', () => {
    expect(loadSlaTimelineFilters(memoryStorage())).toEqual(defaultSlaTimelineFilters());
  });

  it('grava e relê a mesma seleção (é isso que a tela lembra)', () => {
    const storage = memoryStorage();
    const salvo: SlaTimelineFilterSelection = { period: '7d', kinds: ['resolution'], statuses: ['breached'] };
    saveSlaTimelineFilters(salvo, storage);

    expect(JSON.parse(storage.getItem(SLA_TIMELINE_FILTERS_STORAGE_KEY) ?? '{}')).toEqual(salvo);
    expect(loadSlaTimelineFilters(storage)).toEqual(salvo);
  });

  it('JSON quebrado volta ao default em vez de derrubar a tela', () => {
    const storage = memoryStorage({ [SLA_TIMELINE_FILTERS_STORAGE_KEY]: '{não é json' });
    expect(loadSlaTimelineFilters(storage)).toEqual(defaultSlaTimelineFilters());
  });

  it('chave adulterada não inventa filtro: só valores conhecidos, sem repetição', () => {
    const storage = memoryStorage({
      [SLA_TIMELINE_FILTERS_STORAGE_KEY]: JSON.stringify({
        period: '12h',
        kinds: ['resolution', 'resolution', 'inexistente', 7],
        statuses: ['breached', 'ok', 'ok', 'lixo'],
      }),
    });

    expect(loadSlaTimelineFilters(storage)).toEqual({
      period: 'all',
      kinds: ['resolution'],
      statuses: ['breached', 'ok'],
    });
  });

  it('storage bloqueado não quebra nem a leitura nem a gravação', () => {
    expect(loadSlaTimelineFilters(storageQueExplode)).toEqual(defaultSlaTimelineFilters());
    expect(() => saveSlaTimelineFilters({ period: '24h', kinds: [], statuses: [] }, storageQueExplode)).not.toThrow();
  });

  it('sem storage (null) não tenta gravar e devolve o default', () => {
    expect(loadSlaTimelineFilters(null)).toEqual(defaultSlaTimelineFilters());
    expect(() => saveSlaTimelineFilters(defaultSlaTimelineFilters(), null)).not.toThrow();
  });
});

describe('slaTimelineFilterState — contrato do filtro e atalho "só em risco/estourado"', () => {
  it('lista vazia vira "all" (sem corte) e lista cheia vira o array', () => {
    expect(toSlaTimelineFilters(defaultSlaTimelineFilters())).toEqual({
      period: 'all',
      kinds: 'all',
      statuses: 'all',
    });
    expect(toSlaTimelineFilters({ period: '24h', kinds: ['transfer'], statuses: ['warning', 'breached'] })).toEqual({
      period: '24h',
      kinds: ['transfer'],
      statuses: ['warning', 'breached'],
    });
  });

  it('o atalho está ligado só quando as duas situações de risco estão sozinhas', () => {
    expect(isRiskOnlyFilter({ period: 'all', kinds: [], statuses: [...SLA_RISK_STATUSES] })).toBe(true);
    expect(isRiskOnlyFilter({ period: 'all', kinds: [], statuses: [] })).toBe(false);
    expect(isRiskOnlyFilter({ period: 'all', kinds: [], statuses: ['warning'] })).toBe(false);
    expect(isRiskOnlyFilter({ period: 'all', kinds: [], statuses: ['warning', 'breached', 'ok'] })).toBe(false);
  });

  it('um clique liga as duas situações de risco e preserva período e tipo', () => {
    const antes: SlaTimelineFilterSelection = { period: '30d', kinds: ['transfer'], statuses: [] };
    expect(toggleRiskOnlyFilter(antes)).toEqual({ period: '30d', kinds: ['transfer'], statuses: ['warning', 'breached'] });
  });

  it('o mesmo clique desliga e reabre todas as situações', () => {
    const ligado: SlaTimelineFilterSelection = { period: '30d', kinds: ['transfer'], statuses: ['warning', 'breached'] };
    expect(toggleRiskOnlyFilter(ligado).statuses).toEqual([]);
  });

  it('com situações misturadas, o clique passa a mostrar só risco/estourado', () => {
    expect(toggleRiskOnlyFilter({ period: 'all', kinds: [], statuses: ['ok', 'warning', 'breached'] }).statuses).toEqual([
      'warning',
      'breached',
    ]);
  });
});
