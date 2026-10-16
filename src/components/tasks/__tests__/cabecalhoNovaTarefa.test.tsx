/**
 * Etapas 013, 014 e 015 (plano, linhas 251–253; imagem 05, linha 133) — o
 * cabeçalho do módulo de Tarefas.
 *
 * O que este arquivo prova, e por quê:
 *  - o botão "+ Nova tarefa" e a tecla `N` emitem a abertura do modal PELO
 *    `TasksUiContext` (o modal em si é do cartão T35). A prova renderiza o
 *    provedor REAL e lê o mesmo contrato que o modal vai ler — uma sonda pelo
 *    `useTasksUi()`, não um mock que já traz a resposta;
 *  - o menu ⋮ dispara o painel de atalhos que já existe no app (o evento
 *    `show-shortcuts-help`, a mesma porta que o `?` usa);
 *  - "Densidade da lista" escreve a densidade ÚNICA do contexto e o menu mostra
 *    a escolhida.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';

import { TasksHeaderMenu } from '@/components/tasks/shared/TasksHeaderMenu';
import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';

/** Lê o MESMO contexto que o modal (T35) vai consumir. */
function Sonda() {
  const { modalOpen, density } = useTasksUi();
  return (
    <>
      <span data-testid="sonda-modal">{modalOpen ? 'aberto' : 'fechado'}</span>
      <span data-testid="sonda-densidade">{density}</span>
    </>
  );
}

function renderCabecalho() {
  return render(
    <TasksUiProvider>
      <TasksHeaderMenu />
      <Sonda />
    </TasksUiProvider>
  );
}

/** Abre um menu Radix só pelo teclado (jsdom não tem a Pointer Events API). */
const abrirMenu = async () => {
  const gatilho = screen.getByRole('button', { name: 'Mais opções do módulo' });
  fireEvent.keyDown(gatilho, { key: 'Enter', code: 'Enter' });
  return screen.findByRole('menu');
};

/** Fecha o menu atual (Radix escuta Esc no conteúdo). */
const fecharMenu = () => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
};

const comandarTarefa = (id: string) => {
  act(() => {
    document.dispatchEvent(new CustomEvent('tasks-shortcut', { detail: { id } }));
  });
};

beforeEach(() => {
  const proto = Element.prototype as unknown as Record<string, () => unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => cleanup());

describe('cabeçalho de Tarefas — botão, atalho N e menu do módulo', () => {
  it('o botão "+ Nova tarefa" abre o modal pelo TasksUiContext', () => {
    renderCabecalho();
    const botao = screen.getByRole('button', { name: /Nova tarefa/ });

    // anuncia o que o botão faz e o estado atual (fechado)
    expect(botao.getAttribute('aria-haspopup')).toBe('dialog');
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('sonda-modal').textContent).toBe('fechado');

    fireEvent.click(botao);

    expect(screen.getByTestId('sonda-modal').textContent).toBe('aberto');
    expect(botao.getAttribute('aria-expanded')).toBe('true');
  });

  it('a tecla N (tasks-focus-quickadd) emite a MESMA abertura, sem foco paralelo', () => {
    renderCabecalho();
    expect(screen.getByTestId('sonda-modal').textContent).toBe('fechado');

    comandarTarefa('tasks-focus-quickadd');

    expect(screen.getByTestId('sonda-modal').textContent).toBe('aberto');
  });

  it('o menu ⋮ traz "Atalhos de teclado" e ele dispara o painel de atalhos do app', async () => {
    renderCabecalho();
    await abrirMenu();

    const ouvinte = vi.fn();
    document.addEventListener('show-shortcuts-help', ouvinte);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Atalhos de teclado' }));

    expect(ouvinte).toHaveBeenCalledTimes(1);
    document.removeEventListener('show-shortcuts-help', ouvinte);
  });

  it('"Densidade da lista" escreve a densidade única do contexto e mostra a escolhida', async () => {
    renderCabecalho();
    expect(screen.getByTestId('sonda-densidade').textContent).toBe('comfortable');

    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Compacta' }));

    expect(screen.getByTestId('sonda-densidade').textContent).toBe('compact');

    // reabre: o menu marca a densidade que o contexto guarda
    fecharMenu();
    await abrirMenu();
    expect(screen.getByRole('menuitemradio', { name: 'Compacta' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Confortável' }).getAttribute('aria-checked')).toBe('false');
  });

  it('o menu não oferece nada que tire informação do sistema', async () => {
    renderCabecalho();
    await abrirMenu();

    const textoDoMenu = screen.getByRole('menu').textContent ?? '';
    expect(textoDoMenu).not.toMatch(/exportar|baixar|imprimir|copiar/i);
  });
});
