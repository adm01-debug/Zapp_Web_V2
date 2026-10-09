/**
 * Etapa 77 — escopo e guarda de input dos 7 atalhos do módulo de Tarefas.
 * Etapa E09 — o escopo passou a ser só `tasks`: o Quadro vive DENTRO de Tarefas
 * (como modo do `tasks-mode`), então a view `pipeline` não dispara mais nada.
 *
 * O registry global é o único lugar que decide se um atalho vale: ele lê a view
 * da URL canônica (`?view=`) e ignora quem está fora do `scope`. A guarda de
 * input é a mesma de sempre — em INPUT/TEXTAREA/contentEditable só os ids da
 * lista branca passam, e nenhum atalho de Tarefas está nela.
 *
 * O que o módulo faz com cada comando é assunto do `TasksModule.test.tsx`; aqui
 * se prova a porta de entrada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { DEFAULT_SHORTCUTS, TASKS_VIEWS } from '@/hooks/shortcuts/defaultShortcuts';

function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

/** Comandos que o registry repassou ao módulo. */
function escutarTarefas() {
  const recebidos: Array<{ id: string; key?: string }> = [];
  const handler = (e: Event) => recebidos.push((e as CustomEvent<{ id: string; key?: string }>).detail);
  document.addEventListener('tasks-shortcut', handler);
  return { recebidos, parar: () => document.removeEventListener('tasks-shortcut', handler) };
}

function montar(view: string) {
  window.history.replaceState(null, '', `/?view=${view}`);
  render(
    <MemoryRouter>
      <Registry />
    </MemoryRouter>
  );
}

function teclar(key: string, extra: KeyboardEventInit = {}, alvo?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...extra });
  (alvo ?? window).dispatchEvent(event);
}

describe('etapa 77 — registry dos atalhos de Tarefas', () => {
  let espiao: ReturnType<typeof escutarTarefas>;

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    espiao = escutarTarefas();
  });
  afterEach(() => {
    espiao.parar();
    window.history.replaceState(null, '', '/');
  });

  it('registra exatamente 7 atalhos, todos com escopo em `tasks`', () => {
    // E09: o Quadro é um modo DENTRO de Tarefas — a view `pipeline` não vale mais.
    expect(TASKS_VIEWS).toEqual(['tasks']);
    const doModulo = DEFAULT_SHORTCUTS.filter(s => s.scope === TASKS_VIEWS);
    expect(doModulo).toHaveLength(7);
    expect(doModulo.every(s => s.scope?.includes('tasks'))).toBe(true);
    expect(doModulo.map(s => s.id)).toEqual([
      'tasks-focus-quickadd', 'tasks-mode', 'tasks-search', 'tasks-open-sheet',
      'tasks-complete', 'tasks-cancel', 'tasks-help',
    ]);
    // só Tarefas tem escopo: nenhum atalho global ganhou `scope` de carona
    expect(DEFAULT_SHORTCUTS.every(s => !s.scope || s.scope === TASKS_VIEWS)).toBe(true);
  });

  /** Cada tecla do plano e o comando que ela deve produzir. */
  const CASOS: Array<{ key: string; id: string; tecla?: string }> = [
    { key: 'n', id: 'tasks-focus-quickadd' },
    { key: '1', id: 'tasks-mode', tecla: '1' },
    { key: '2', id: 'tasks-mode', tecla: '2' },
    { key: '3', id: 'tasks-mode', tecla: '3' },
    { key: '/', id: 'tasks-search' },
    { key: 'e', id: 'tasks-open-sheet' },
    { key: 'x', id: 'tasks-complete' },
    { key: 'Delete', id: 'tasks-cancel' },
  ];

  it('em ?view=tasks cada tecla dispara o comando certo (7 atalhos)', () => {
    montar('tasks');
    for (const caso of CASOS) {
      espiao.recebidos.length = 0;
      teclar(caso.key);
      expect(espiao.recebidos).toEqual([{ id: caso.id, key: caso.tecla }]);
    }
  });

  it('em ?view=pipeline nada dispara (o Quadro agora é um modo de Tarefas)', () => {
    montar('pipeline');
    for (const key of ['n', '1', '2', '3', '/', 'e', 'x', 'Delete']) teclar(key);
    teclar('?', { shiftKey: true });
    expect(espiao.recebidos).toHaveLength(0);
  });

  it('fora das rotas de Tarefas o registry ignora os atalhos', () => {
    montar('inbox');
    for (const key of ['n', '1', '2', '3', '/', 'e', 'x', 'Delete']) teclar(key);
    expect(espiao.recebidos).toHaveLength(0);
  });

  it('guarda de input: digitando num campo, nenhum dos 7 dispara', () => {
    montar('tasks');
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    campo.focus();

    for (const key of ['n', '1', '2', '3', '/', 'e', 'x', 'Delete']) teclar(key, {}, campo);

    expect(espiao.recebidos).toHaveLength(0);
    campo.remove();
  });

  it('modificadores mandam: Ctrl+N não é o N de Tarefas', () => {
    montar('tasks');
    teclar('n', { ctrlKey: true });
    expect(espiao.recebidos).toHaveLength(0);
  });

  it('? abre o painel de atalhos', () => {
    montar('tasks');
    const abrir = vi.fn();
    document.addEventListener('show-shortcuts-help', abrir);

    fireEvent.keyDown(window, { key: '?', shiftKey: true });

    expect(abrir).toHaveBeenCalledTimes(1);
    document.removeEventListener('show-shortcuts-help', abrir);
  });
});
