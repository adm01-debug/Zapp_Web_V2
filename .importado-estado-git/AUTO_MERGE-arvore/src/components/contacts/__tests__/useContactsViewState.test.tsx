import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('useContactsViewState — atalhos de visualização (G/L/T/M/A/P)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crud.searchInput = '';
    crud.selectedIds = [];
  });

  it.each([
    ['l', 'list'],
    ['t', 'table'],
    ['m', 'map'],
    ['a', 'analytics'],
    ['p', 'kanban'],
    ['g', 'grid'],
  ] as const)('tecla "%s" troca para a visualização %s', (key, mode) => {
    const { result } = renderHook(() => useContactsViewState());
    const event = press(key);
    expect(result.current.viewMode).toBe(mode);
    expect(event.defaultPrevented).toBe(true);
  });

  it('não troca de visualização quando o foco está num campo de texto', () => {
    const { result } = renderHook(() => useContactsViewState());
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      press('m', {}, input);
      expect(result.current.viewMode).toBe('grid');
    } finally {
      input.remove();
    }
  });

  it('não troca de visualização com um diálogo aberto nem com modificador', () => {
    const { result } = renderHook(() => useContactsViewState());
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    try {
      press('m');
      expect(result.current.viewMode).toBe('grid');
    } finally {
      dialog.remove();
    }
    press('l', { ctrlKey: true });
    expect(result.current.viewMode).toBe('grid');
  });

  it('Ctrl+A dentro de contentEditable fica com o campo (não seleciona contatos)', () => {
    renderHook(() => useContactsViewState());
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    try {
      const event = press('a', { ctrlKey: true }, editable);
      expect(crud.setSelectedIds).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      editable.remove();
    }
  });
});
