import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useNavigationHistory } from './useNavigationHistory';

/**
 * Trava a fonte única de navegação: o hook NÃO pode sincronizar só a própria
 * instância — toda navegação (navigateTo/goBack/goForward) precisa emitir o
 * evento `zapp:navigate`, senão instâncias paralelas (ActiveCallBar) ficam com
 * `currentView` obsoleto. Este teste monta duas instâncias reais e exige que a
 * segunda observe a navegação feita pela primeira.
 */

function Navigator() {
  const { currentView, navigateTo, goBack, goForward } = useNavigationHistory('inbox');
  return (
    <div>
      <span data-testid="nav-view">{currentView}</span>
      <button data-testid="go-contacts" onClick={() => navigateTo('contacts')}>contacts</button>
      <button data-testid="go-dashboard" onClick={() => navigateTo('dashboard')}>dashboard</button>
      <button data-testid="go-back" onClick={goBack}>back</button>
      <button data-testid="go-forward" onClick={goForward}>forward</button>
    </div>
  );
}

function Observer() {
  const { currentView } = useNavigationHistory('inbox');
  return <span data-testid="obs-view">{currentView}</span>;
}

function Harness() {
  return (
    <div>
      <Navigator />
      <Observer />
    </div>
  );
}

const view = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  // jsdom não recria window.location entre testes no mesmo arquivo — restaura a URL.
  window.history.replaceState(null, '', '/');
});

describe('useNavigationHistory — fonte única de navegação', () => {
  it('navigateTo emite zapp:navigate e sincroniza uma segunda instância', () => {
    render(<Harness />);
    expect(view('nav-view')).toBe('inbox');
    expect(view('obs-view')).toBe('inbox');

    fireEvent.click(screen.getByTestId('go-contacts'));

    expect(view('nav-view')).toBe('contacts');
    // A segunda instância só acompanha se navigateTo emitir o evento.
    expect(view('obs-view')).toBe('contacts');
  });

  it('goBack também emite zapp:navigate e sincroniza a segunda instância', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('go-contacts'));
    fireEvent.click(screen.getByTestId('go-dashboard'));
    expect(view('obs-view')).toBe('dashboard');

    fireEvent.click(screen.getByTestId('go-back'));

    expect(view('nav-view')).toBe('contacts');
    expect(view('obs-view')).toBe('contacts');
  });
});
