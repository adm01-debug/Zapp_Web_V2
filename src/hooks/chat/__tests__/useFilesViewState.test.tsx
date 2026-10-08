import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_FILES_VIEW_PREFS,
  DEFAULT_FILES_VIEW_SESSION,
  clearFilesViewSessionCache,
  filesViewStorageKey,
  useFilesViewState,
} from '@/hooks/chat/useFilesViewState';

let authCallback: ((event: string) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  },
}));

const USER = 'user-1';
const OTHER_USER = 'user-2';
const CONTACT = 'contact-1';

beforeEach(() => {
  localStorage.clear();
  clearFilesViewSessionCache();
  authCallback = null;
  vi.clearAllMocks();
});

describe('useFilesViewState — preferencias (localStorage)', () => {
  it('storage ausente: comeca no default decidido em D3 (grid, 4 colunas)', () => {
    const { result } = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(result.current.viewMode).toBe('grid');
    expect(result.current.columns).toBe(4);
    expect(result.current.sort).toBe('recent');
    expect(result.current.typeFilter).toBe('all');
    expect(result.current.search).toBe('');
  });

  it('storage invalido: JSON quebrado, versao desconhecida e valores fora do dominio caem no default', () => {
    localStorage.setItem(filesViewStorageKey(USER), '{nao-e-json');
    const quebrado = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(quebrado.result.current.viewMode).toBe(DEFAULT_FILES_VIEW_PREFS.viewMode);
    expect(quebrado.result.current.columns).toBe(DEFAULT_FILES_VIEW_PREFS.columns);

    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 99, viewMode: 'table', columns: 6 }));
    const versaoErrada = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(versaoErrada.result.current.viewMode).toBe('grid');
    expect(versaoErrada.result.current.columns).toBe(4);

    // versao certa, valores fora do dominio: cada campo e sanitizado por conta propria
    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 1, viewMode: 'carrossel', columns: 7 }));
    const foraDoDominio = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(foraDoDominio.result.current.viewMode).toBe('grid');
    expect(foraDoDominio.result.current.columns).toBe(4);
  });

  it('sanitiza campo a campo: viewMode valido com columns invalido mantem o viewMode', () => {
    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 1, viewMode: 'table', columns: 12 }));
    const { result } = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(result.current.viewMode).toBe('table');
    expect(result.current.columns).toBe(4);
  });

  it('preferencia salva de 6 ou 8 colunas (removidas do dominio) reabre no default 4', () => {
    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 1, viewMode: 'grid', columns: 6 }));
    const seis = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(seis.result.current.columns).toBe(4);

    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 1, viewMode: 'grid', columns: 8 }));
    const oito = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(oito.result.current.columns).toBe(4);
  });

  it('persiste viewMode e columns, sem tocar nas chaves do catalogo do Promo Gifts', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { result } = renderHook(() => useFilesViewState(USER, CONTACT));

    act(() => result.current.setViewMode('list'));
    act(() => result.current.setColumns(5));

    expect(JSON.parse(localStorage.getItem(filesViewStorageKey(USER))!)).toEqual({
      v: 1,
      viewMode: 'list',
      columns: 5,
    });

    const touchedKeys = [...setItem.mock.calls, ...getItem.mock.calls].map((call) => String(call[0]));
    expect(touchedKeys.some((key) => /product-grid-columns|catalog-view-mode/.test(key))).toBe(false);
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('filtro, busca e ordenacao NAO vao para o storage (recorte e de sessao)', () => {
    const { result } = renderHook(() => useFilesViewState(USER, CONTACT));
    act(() => result.current.setTypeFilter('video'));
    act(() => result.current.setSearch('x'));
    act(() => result.current.setSort('biggest'));

    const stored = localStorage.getItem(filesViewStorageKey(USER));
    if (stored) {
      expect(stored).not.toContain('video');
      expect(stored).not.toContain('biggest');
      expect(JSON.parse(stored)).toEqual({ v: 1, viewMode: 'grid', columns: 4 });
    }
    // e o estado em memoria responde
    expect(result.current.typeFilter).toBe('video');
    expect(result.current.search).toBe('x');
    expect(result.current.sort).toBe('biggest');
  });
});

describe('useFilesViewState — sessao (memoria por <userId>:<contactId>)', () => {
  it('remontar com o mesmo contato restaura filtro e busca; com outro contato comeca limpo', () => {
    const primeiro = renderHook(() => useFilesViewState(USER, CONTACT));
    act(() => primeiro.result.current.setTypeFilter('video'));
    act(() => primeiro.result.current.setSearch('x'));
    act(() => primeiro.result.current.setSort('alpha'));
    primeiro.unmount();

    const remontado = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(remontado.result.current.typeFilter).toBe('video');
    expect(remontado.result.current.search).toBe('x');
    expect(remontado.result.current.sort).toBe('alpha');

    const outroContato = renderHook(() => useFilesViewState(USER, 'contact-2'));
    expect(outroContato.result.current.typeFilter).toBe(DEFAULT_FILES_VIEW_SESSION.typeFilter);
    expect(outroContato.result.current.search).toBe('');
  });

  it('trocar de usuario no mesmo navegador e mesmo contato comeca limpo (preferencia nao vaza)', () => {
    localStorage.setItem(filesViewStorageKey(USER), JSON.stringify({ v: 1, viewMode: 'table', columns: 8 }));
    const primeiro = renderHook(() => useFilesViewState(USER, CONTACT));
    act(() => primeiro.result.current.setSearch('segredo-do-user-1'));

    const segundo = renderHook(() => useFilesViewState(OTHER_USER, CONTACT));
    expect(segundo.result.current.search).toBe('');
    expect(segundo.result.current.viewMode).toBe('grid');
    expect(segundo.result.current.columns).toBe(4);
  });

  it('SIGNED_OUT esvazia o cache de sessao', () => {
    const primeiro = renderHook(() => useFilesViewState(USER, CONTACT));
    act(() => primeiro.result.current.setSearch('x'));
    primeiro.unmount();

    expect(authCallback).not.toBeNull();
    act(() => authCallback!('SIGNED_OUT'));

    const depoisDoLogout = renderHook(() => useFilesViewState(USER, CONTACT));
    expect(depoisDoLogout.result.current.search).toBe('');
  });

  it('trocar de contato com o hook montado volta ao default (nao herda o recorte anterior)', () => {
    const { result, rerender } = renderHook(
      ({ contactId }) => useFilesViewState(USER, contactId),
      { initialProps: { contactId: CONTACT } },
    );
    act(() => result.current.setTypeFilter('document'));
    act(() => result.current.setSearch('contrato'));

    rerender({ contactId: 'contact-9' });
    expect(result.current.typeFilter).toBe('all');
    expect(result.current.search).toBe('');
  });
});
