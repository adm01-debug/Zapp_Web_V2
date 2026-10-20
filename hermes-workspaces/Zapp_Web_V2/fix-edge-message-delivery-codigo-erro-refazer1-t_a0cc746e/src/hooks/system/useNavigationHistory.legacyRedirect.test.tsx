import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useNavigationHistory, LEGACY_VIEW_REDIRECTS, resolveLegacyView } from './useNavigationHistory';

/**
 * TRA-010 / BACKLOG_VERIFICADO #178 (P2, área hooks).
 *
 * A remoção do módulo "Etiquetas" apagou `TagsView`, o item de menu e o hook
 * `useTags`, mas não deixou redirect para o link/favorito antigo
 * (`?view=tags`). O id vira desconhecido e o ViewRouter cai no fallback
 * (tela não prevista). Este teste prova o comportamento exigido:
 *
 *   - `?view=tags` entrega a tela vigente equivalente (`contacts`);
 *   - a URL é reescrita para `?view=contacts` (favorito/link coerente);
 *   - views válidas seguem intactas.
 *
 * Antes do conserto o hook entrega `tags` e não mexe na URL (vermelho).
 */

function Probe() {
  const { currentView } = useNavigationHistory('inbox');
  return <span data-testid="view">{currentView}</span>;
}

const urlView = () => new URLSearchParams(window.location.search).get('view');

beforeEach(() => {
  // jsdom não recria window.location entre testes no mesmo arquivo — restaura a URL.
  window.history.replaceState(null, '', '/');
});

describe('useNavigationHistory — compatibilidade de rota do view=tags removido', () => {
  it('resolve ?view=tags para a tela vigente (contacts) e reescreve a URL', () => {
    window.history.replaceState(null, '', '/?view=tags');

    render(<Probe />);

    expect(screen.getByTestId('view').textContent).toBe('contacts');
    expect(urlView()).toBe('contacts');
  });

  it('resolve #tags para estado e URL canônicos de contacts na carga inicial', () => {
    window.history.replaceState(null, '', '/#tags');

    render(<Probe />);

    expect(screen.getByTestId('view').textContent).toBe('contacts');
    expect(urlView()).toBe('contacts');
    expect(window.location.hash).toBe('');
  });

  it('resolve #tags para contacts quando o hash muda durante a sessão', () => {
    window.history.replaceState(null, '', '/?view=inbox');
    render(<Probe />);

    act(() => {
      window.history.replaceState(null, '', '/?view=inbox#tags');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByTestId('view').textContent).toBe('contacts');
    expect(urlView()).toBe('contacts');
    expect(window.location.hash).toBe('');
  });

  it('não mexe na URL de uma view válida', () => {
    window.history.replaceState(null, '', '/?view=dashboard');

    render(<Probe />);

    expect(screen.getByTestId('view').textContent).toBe('dashboard');
    expect(urlView()).toBe('dashboard');
  });

  it('resolveLegacyView mapeia só os ids de módulos removidos', () => {
    expect(LEGACY_VIEW_REDIRECTS.tags).toBe('contacts');
    expect(resolveLegacyView('tags')).toBe('contacts');
    expect(resolveLegacyView('contacts')).toBe('contacts');
  });
});
