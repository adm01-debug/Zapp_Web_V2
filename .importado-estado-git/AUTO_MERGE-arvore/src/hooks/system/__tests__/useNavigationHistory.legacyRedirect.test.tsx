import { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useNavigationHistory, resolveLegacyView } from '../useNavigationHistory';

/**
 * E07 — fusão do módulo "Quadro" no módulo "Tarefas"
 * (docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md).
 *
 * O item `pipeline` do menu era a MESMA tela de Tarefas forçada no modo Quadro.
 * Com essa porta de entrada removida, quem chega por favorito/link/histórico
 * antigo (`?view=pipeline` ou `#pipeline`) tem de cair em `tasks` JÁ no Quadro —
 * gravando `tasks-mode='board'`, a MESMA preferência que `TasksModule` lê.
 *
 * Regra de escopo: SÓ a entrada legada grava. Entrar por `?view=tasks` retoma o
 * modo salvo e não pode sobrescrevê-lo.
 *
 * Antes do conserto: `?view=pipeline` entrega a view `pipeline` (que não existe
 * mais no menu) e nenhum modo é gravado — teste vermelho.
 */

const MODE_STORAGE_KEY = 'tasks-mode';

function Probe() {
  const { currentView } = useNavigationHistory('inbox');
  return <span data-testid="view">{currentView}</span>;
}

const view = () => screen.getByTestId('view').textContent;
const urlView = () => new URLSearchParams(window.location.search).get('view');
const savedMode = () => window.localStorage.getItem(MODE_STORAGE_KEY);

beforeEach(() => {
  // jsdom não recria window.location nem limpa o localStorage entre testes.
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('useNavigationHistory — link legado do Quadro (`pipeline`) vira Tarefas no Quadro (E07)', () => {
  it('`?view=pipeline` abre `tasks` no Quadro e reescreve a URL', () => {
    window.history.replaceState(null, '', '/?view=pipeline');

    render(<Probe />);

    expect(view()).toBe('tasks');
    expect(urlView()).toBe('tasks');
    expect(savedMode()).toBe('board');
  });

  it('`#pipeline` abre `tasks` no Quadro na carga inicial', () => {
    window.history.replaceState(null, '', '/#pipeline');

    render(<Probe />);

    expect(view()).toBe('tasks');
    expect(urlView()).toBe('tasks');
    expect(window.location.hash).toBe('');
    expect(savedMode()).toBe('board');
  });

  it('`#pipeline` durante a sessão também abre `tasks` no Quadro', () => {
    window.history.replaceState(null, '', '/?view=inbox');
    render(<Probe />);
    expect(view()).toBe('inbox');
    expect(savedMode()).toBeNull();

    act(() => {
      window.history.replaceState(null, '', '/?view=inbox#pipeline');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(view()).toBe('tasks');
    expect(urlView()).toBe('tasks');
    expect(window.location.hash).toBe('');
    expect(savedMode()).toBe('board');
  });

  it('voltar o navegador para uma URL legada abre `tasks` no Quadro', () => {
    window.history.replaceState(null, '', '/?view=inbox');
    render(<Probe />);

    act(() => {
      window.history.replaceState(null, '', '/?view=pipeline');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    expect(view()).toBe('tasks');
    expect(savedMode()).toBe('board');
  });

  it('entrar por `?view=tasks` retoma o modo salvo sem sobrescrevê-lo', () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, 'agenda');
    window.history.replaceState(null, '', '/?view=tasks');

    render(<Probe />);

    expect(view()).toBe('tasks');
    expect(savedMode()).toBe('agenda');
  });

  it('a gravação é da entrada legada: reabrir a URL canônica não reescreve a preferência', () => {
    window.history.replaceState(null, '', '/?view=pipeline');
    const primeira = render(<Probe />);
    expect(savedMode()).toBe('board');
    primeira.unmount();

    // O usuário troca o modo para Lista e reabre o link canônico de Tarefas.
    window.localStorage.setItem(MODE_STORAGE_KEY, 'list');
    window.history.replaceState(null, '', '/?view=tasks');
    render(<Probe />);

    expect(savedMode()).toBe('list');
  });

  it('o modo é gravado antes do primeiro render de Tarefas, que lê a preferência no `useState`', () => {
    window.history.replaceState(null, '', '/?view=pipeline');

    // Reproduz a ordem real da aplicação: quem tem o histórico (Index) resolve a
    // view e só então o módulo de Tarefas renderiza e lê `tasks-mode`. A leitura
    // acontece no `useState` do módulo — ANTES de qualquer efeito —, então a
    // gravação da entrada legada não pode depender de um efeito para valer.
    function Tarefa() {
      const [modo] = useState(() => window.localStorage.getItem(MODE_STORAGE_KEY));
      return <span data-testid="modo">{modo}</span>;
    }

    function Raiz() {
      const { currentView } = useNavigationHistory('inbox');
      return <>{currentView === 'tasks' ? <Tarefa /> : null}</>;
    }

    render(<Raiz />);

    expect(screen.getByTestId('modo').textContent).toBe('board');
  });

  it('resolveLegacyView mapeia `pipeline` para `tasks` e não mexe em `tasks`', () => {
    expect(resolveLegacyView('pipeline')).toBe('tasks');
    expect(resolveLegacyView('tasks')).toBe('tasks');
  });
});
