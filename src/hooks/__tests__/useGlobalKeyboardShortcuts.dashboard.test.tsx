/**
 * P2 #447 — Ctrl+2 (Ir para Dashboard) precisa SELECIONAR a view Dashboard.
 *
 * O defeito: a ação `go-to-dashboard` do registry global só chamava
 * `navigate('/')` e anunciava no toast. A navegação canônica do app é a view na
 * URL (`?view=<id>`) + o evento `zapp:navigate` — fonte única: `navigateToView`,
 * em `src/hooks/system/useNavigationHistory.ts`, que é o que o shell e as
 * instâncias de `useNavigationHistory` escutam. Sem isso, o toast anunciava
 * Dashboard e a tela continuava em Inbox.
 *
 * Antes da correção: a URL seguia `?view=inbox` e nenhum `zapp:navigate` saía —
 * as duas asserções do primeiro teste falham.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, BrowserRouter, useLocation } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';

/** O registry global, montado como no app (GlobalKeyboardProvider). */
function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

/** Sonda da rota do react-router (não da janela): prova para onde o app foi. */
function Sonda() {
  const location = useLocation();
  return <span data-testid="rota">{`${location.pathname}${location.search}`}</span>;
}

/**
 * Eventos `zapp:navigate` emitidos — é o que sincroniza a view nas telas.
 *
 * O `detail` do evento é `{ view, entryId }` quando a navegação empilha entrada
 * nova (`navigateToView` em `src/hooks/system/useNavigationHistory.ts`): a prova
 * desta cartela é o CAMPO `view`, não a igualdade profunda do objeto inteiro —
 * comparar o objeto todo reprovaria o evento por causa do `entryId` legítimo.
 */
function escutarNavegacao() {
  const recebidos: Array<{ view?: string; entryId?: string }> = [];
  const handler = (e: Event) =>
    recebidos.push((e as CustomEvent<{ view?: string; entryId?: string }>).detail);
  window.addEventListener('zapp:navigate', handler);
  /** As views pedidas pelos eventos recebidos: `detail.view` de cada um. */
  const viewsPedidas = () => recebidos.map(d => d?.view);
  return {
    recebidos,
    viewsPedidas,
    parar: () => window.removeEventListener('zapp:navigate', handler),
  };
}

function teclar(key: string, extra: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
}

/** View da URL canônica da janela (`?view=`). */
function viewDaUrl(): string | null {
  return new URLSearchParams(window.location.search).get('view');
}

describe('#447 — Ctrl+2 seleciona a view dashboard', () => {
  let nav: ReturnType<typeof escutarNavegacao>;

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    nav = escutarNavegacao();
  });

  afterEach(() => {
    nav.parar();
    window.history.replaceState(null, '', '/');
  });

  it('Ctrl+2 em /?view=inbox deixa a URL em ?view=dashboard e emite zapp:navigate', () => {
    window.history.replaceState(null, '', '/?view=inbox');
    render(
      <MemoryRouter>
        <Registry />
      </MemoryRouter>
    );

    teclar('2', { ctrlKey: true });

    // URL canônica do app (?view=<id>), não apenas a rota raiz.
    expect(viewDaUrl()).toBe('dashboard');
    // Evento que o useNavigationHistory usa para sincronizar a view — a prova é o
    // CAMPO `view` do detail (o mesmo detail legítimo traz `entryId` junto).
    expect(nav.viewsPedidas()).toContain('dashboard');
    // O aviso continua acontecendo (e agora diz a verdade).
    expect(toast.info).toHaveBeenCalledWith('📊 Dashboard', { duration: 1500 });
  });

  it('Ctrl+2 já em ?view=dashboard não tira a view do dashboard', () => {
    window.history.replaceState(null, '', '/?view=dashboard');
    render(
      <MemoryRouter>
        <Registry />
      </MemoryRouter>
    );

    teclar('2', { ctrlKey: true });

    expect(viewDaUrl()).toBe('dashboard');
    expect(nav.viewsPedidas()).toContain('dashboard');
  });

  it('Ctrl+2 fora do shell (/sla) volta para a raiz já com ?view=dashboard', async () => {
    window.history.replaceState(null, '', '/sla');
    render(
      <BrowserRouter>
        <Registry />
        <Sonda />
      </BrowserRouter>
    );
    expect(screen.getByTestId('rota').textContent).toBe('/sla');

    teclar('2', { ctrlKey: true });

    // react-router v7 agenda a navegação numa transition: a URL da JANELA muda
    // antes do commit do estado do router. As DUAS provas — a URL da janela e a
    // sonda (`useLocation`) — vão na MESMA condição: ler o DOM fora daqui corria
    // com a transition e a sonda ainda mostrava '/sla' (o flake de 08/10).
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
      expect(window.location.search).toBe('?view=dashboard');
      expect(screen.getByTestId('rota').textContent).toBe('/?view=dashboard');
    });
    expect(nav.viewsPedidas()).toContain('dashboard');
  });

  it('sem Ctrl o "2" não navega (o modificador continua obrigatório)', () => {
    window.history.replaceState(null, '', '/?view=inbox');
    render(
      <MemoryRouter>
        <Registry />
      </MemoryRouter>
    );

    teclar('2');

    expect(viewDaUrl()).toBe('inbox');
    expect(nav.recebidos).toHaveLength(0);
  });
});
