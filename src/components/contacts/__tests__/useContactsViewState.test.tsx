import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FilterPreset } from '../FilterPresets';

const crud = vi.hoisted(() => ({
  contacts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as { id: string }[],
  searchInput: '',
  clearSearch: vi.fn(),
  setActiveTab: vi.fn(),
  setFilterCompany: vi.fn(),
  setFilterJobTitle: vi.fn(),
  setFilterTag: vi.fn(),
  setFilterDateRange: vi.fn(),
  selectedIds: [] as string[],
  setSelectedIds: vi.fn(),
  setIsAddDialogOpen: vi.fn(),
}));

vi.mock('../useContactsCRUD', () => ({ useContactsCRUD: () => crud }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { useContactsViewState } from '../useContactsViewState';

function press(key: string, opts: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  act(() => { target.dispatchEvent(event); });
  return event;
}

/** `setSelectedIds` recebe um updater; aplica sobre `prev` para ver o resultado. */
function lastSelection(prev: string[]): string[] {
  const calls = crud.setSelectedIds.mock.calls;
  const arg = calls[calls.length - 1][0] as string[] | ((p: string[]) => string[]);
  return typeof arg === 'function' ? arg(prev) : arg;
}

describe('useContactsViewState — atalhos e sanitização (etapa 79)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crud.searchInput = '';
    crud.selectedIds = [];
  });

  it('Ctrl+N abre o formulário de novo contato', () => {
    renderHook(() => useContactsViewState());
    const event = press('n', { ctrlKey: true });
    expect(crud.setIsAddDialogOpen).toHaveBeenCalledWith(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Ctrl+A fora de campo de texto seleciona todos os contatos da lista', () => {
    renderHook(() => useContactsViewState());
    const event = press('a', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(lastSelection([])).toEqual(['a', 'b', 'c']);
    expect(lastSelection(['a', 'b', 'c'])).toEqual([]);
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
  ])('Ctrl+A dentro de %s fica com o campo (não seleciona contatos)', (_name, make) => {
    renderHook(() => useContactsViewState());
    const field = make();
    document.body.appendChild(field);
    try {
      const event = press('a', { ctrlKey: true }, field);
      expect(crud.setSelectedIds).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      field.remove();
    }
  });

  it('Esc fecha o painel de detalhe antes de mexer na seleção', () => {
    crud.selectedIds = ['a'];
    const { result } = renderHook(() => useContactsViewState());
    act(() => { result.current.handleContactClick('b'); });
    expect(result.current.detailContact).toEqual({ id: 'b' });

    press('Escape');
    expect(result.current.detailContact).toBeNull();
    expect(crud.setSelectedIds).not.toHaveBeenCalled();

    press('Escape');
    expect(crud.setSelectedIds).toHaveBeenCalledWith([]);
  });

  it('Esc que fecha um diálogo aberto não limpa a seleção', () => {
    crud.selectedIds = ['a', 'b'];
    renderHook(() => useContactsViewState());
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    try {
      press('Escape');
      expect(crud.setSelectedIds).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
    }
  });

  it('Esc sem painel nem seleção limpa a busca', () => {
    crud.searchInput = 'ana';
    renderHook(() => useContactsViewState());
    press('Escape');
    expect(crud.clearSearch).toHaveBeenCalledTimes(1);
  });

  it('preset com tipo extinto cai em "all"; tipo canônico é aplicado', () => {
    const { result } = renderHook(() => useContactsViewState());
    const preset = (type: string): FilterPreset => ({ id: type, name: type, filters: { type, company: 'ACME' } });

    act(() => { result.current.handleApplyPreset(preset('lead')); });
    expect(crud.setActiveTab).toHaveBeenLastCalledWith('all');
    expect(crud.setFilterCompany).toHaveBeenLastCalledWith('ACME');

    act(() => { result.current.handleApplyPreset(preset('fornecedor')); });
    expect(crud.setActiveTab).toHaveBeenLastCalledWith('fornecedor');
  });
});

describe('useContactsViewState — modo lembrado e painel sem dado antigo', () => {
  const BASE_CONTACTS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as { id: string }[];

  beforeEach(() => {
    vi.clearAllMocks();
    crud.searchInput = '';
    crud.selectedIds = [];
    crud.contacts = [...BASE_CONTACTS];
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    crud.contacts = [...BASE_CONTACTS];
  });

  it('persiste o modo escolhido e o recupera na próxima visita (sem voltar para Cards)', () => {
    const first = renderHook(() => useContactsViewState());
    expect(first.result.current.viewMode).toBe('grid');

    act(() => { first.result.current.setViewMode('table'); });
    expect(first.result.current.viewMode).toBe('table');
    expect(window.localStorage.getItem('contacts:view-mode')).toBe('table');
    first.unmount();

    const second = renderHook(() => useContactsViewState());
    expect(second.result.current.viewMode).toBe('table');
  });

  it('valor guardado desconhecido/antigo não vira modo inválido: cai no padrão Cards', () => {
    window.localStorage.setItem('contacts:view-mode', 'modo-que-nao-existe');
    const { result } = renderHook(() => useContactsViewState());
    expect(result.current.viewMode).toBe('grid');
  });

  it('localStorage indisponível não quebra a tela: usa o padrão e mantém a troca na sessão', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    try {
      const { result } = renderHook(() => useContactsViewState());
      expect(result.current.viewMode).toBe('grid');
      act(() => { result.current.setViewMode('list'); });
      expect(result.current.viewMode).toBe('list');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('painel de detalhe acompanha a lista: salvar o contato atualiza o painel aberto', () => {
    const { result, rerender } = renderHook(() => useContactsViewState());
    act(() => { result.current.handleContactClick('b'); });
    expect(result.current.detailContact).toEqual({ id: 'b' });

    // refetch após salvar traz a linha nova; o painel derivado mostra o nome novo
    crud.contacts = [{ id: 'a' }, { id: 'b', name: 'Nome Atualizado' }, { id: 'c' }] as { id: string }[];
    rerender();
    expect(result.current.detailContact).toEqual({ id: 'b', name: 'Nome Atualizado' });
  });

  it('contato que sai da lista (filtro/tipo mudou) fecha o painel em vez de mostrar cópia velha', () => {
    const { result, rerender } = renderHook(() => useContactsViewState());
    act(() => { result.current.handleContactClick('b'); });
    expect(result.current.detailContact).toEqual({ id: 'b' });

    crud.contacts = [{ id: 'a' }, { id: 'c' }] as { id: string }[];
    rerender();
    expect(result.current.detailContact).toBeNull();
  });
});
