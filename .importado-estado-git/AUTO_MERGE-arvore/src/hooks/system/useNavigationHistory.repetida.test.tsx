import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useNavigationHistory } from './useNavigationHistory';

/**
 * R2-PLAT-001 / BACKLOG_VERIFICADO #439 (P2, área hooks).
 *
 * Com a MESMA view em duas posições do histórico, avançar pelo navegador tem de
 * selecionar a ocorrência POSTERIOR. Exemplo do achado: A,B,C,B,D com a posição
 * em C — avançar para B deve cair no índice 3, não no índice 1.
 *
 * O callback de `popstate` recebia só a view e procurava correspondência para
 * trás primeiro, retornando antes de olhar para frente; então escolhia o B
 * anterior. A trilha e os próximos voltar/avançar passavam a operar na
 * ocorrência errada. Aqui a travessia do navegador é simulada com o estado REAL
 * que o hook grava em `history.state` (identidade da entrada) — o teste não
 * inventa índices nem ids: lê o que a produção gravou em cada entrada.
 */

type BrowserEntry = { state: unknown; url: string };

let stack: BrowserEntry[];
let ptr: number;
let realPush: typeof window.history.pushState;
let realReplace: typeof window.history.replaceState;

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=inbox');
  stack = [{ state: null, url: '/?view=inbox' }];
  ptr = 0;

  realPush = window.history.pushState.bind(window.history);
  realReplace = window.history.replaceState.bind(window.history);

  // Espelha as entradas reais do navegador (jsdom não implementa travessia).
  window.history.pushState = ((state: unknown, _title: string, url?: string | URL | null) => {
    stack = stack.slice(0, ptr + 1);
    stack.push({ state, url: url == null ? window.location.href : String(url) });
    ptr = stack.length - 1;
    realPush(state, '', url);
  }) as typeof window.history.pushState;

  window.history.replaceState = ((state: unknown, _title: string, url?: string | URL | null) => {
    stack[ptr] = { state, url: url == null ? window.location.href : String(url) };
    realReplace(state, '', url);
  }) as typeof window.history.replaceState;
});

afterEach(() => {
  window.history.pushState = realPush;
  window.history.replaceState = realReplace;
});

function Harness() {
  const { currentView, navigateTo, goBack, goForward, canGoForward, breadcrumbTrail, history } =
    useNavigationHistory('inbox');
  return (
    <div>
      <span data-testid="view">{currentView}</span>
      <span data-testid="trail">{breadcrumbTrail.join('>')}</span>
      <span data-testid="can-forward">{String(canGoForward)}</span>
      <span data-testid="len">{history.length}</span>
      <button data-testid="go-contacts" onClick={() => navigateTo('contacts')}>contacts</button>
      <button data-testid="go-dashboard" onClick={() => navigateTo('dashboard')}>dashboard</button>
      <button data-testid="go-tasks" onClick={() => navigateTo('tasks')}>tasks</button>
      <button data-testid="forward" onClick={goForward}>forward</button>
      <button data-testid="back" onClick={goBack}>back</button>
    </div>
  );
}

const view = () => screen.getByTestId('view').textContent;
const trail = () => screen.getByTestId('trail').textContent;
const len = () => screen.getByTestId('len').textContent;

/** Simula o navegador indo para a entrada de índice `target` (voltar/avançar). */
function browserGo(target: number) {
  ptr = target;
  const entry = stack[target];
  act(() => {
    window.history.replaceState(entry.state, '', entry.url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
  });
}

describe('useNavigationHistory — avançar para uma tela repetida (#439)', () => {
  it('seleciona a ocorrência POSTERIOR, não a anterior', () => {
    render(<Harness />);

    // A,B,C,B,D — a view "contacts" ocupa os índices 1 e 3.
    fireEvent.click(screen.getByTestId('go-contacts'));
    fireEvent.click(screen.getByTestId('go-dashboard'));
    fireEvent.click(screen.getByTestId('go-contacts'));
    fireEvent.click(screen.getByTestId('go-tasks'));
    expect(view()).toBe('tasks');
    expect(trail()).toBe('contacts>dashboard>contacts>tasks');

    // Navegador volta duas entradas: a posição cai em C (índice 2).
    browserGo(2);
    expect(view()).toBe('dashboard');
    expect(trail()).toBe('inbox>contacts>dashboard');

    // Navegador AVANÇA para a tela repetida: tem de escolher o B POSTERIOR (índice 3).
    browserGo(3);
    expect(view()).toBe('contacts');
    expect(trail()).toBe('inbox>contacts>dashboard>contacts');
    expect(screen.getByTestId('can-forward').textContent).toBe('true');

    // E o próximo avançar da aplicação segue para D, não para C.
    fireEvent.click(screen.getByTestId('forward'));
    expect(view()).toBe('tasks');
  });

  it('não duplica entradas na navegação programática nem na travessia do navegador', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('go-contacts'));
    fireEvent.click(screen.getByTestId('go-dashboard'));
    expect(len()).toBe('3');

    // Mesma view já ativa: não empilha.
    fireEvent.click(screen.getByTestId('go-dashboard'));
    expect(len()).toBe('3');

    // Voltar/avançar da aplicação reusa a entrada, não cria outra.
    fireEvent.click(screen.getByTestId('back'));
    expect(len()).toBe('3');
    fireEvent.click(screen.getByTestId('forward'));
    expect(len()).toBe('3');

    // Travessia do navegador reconcilia a entrada existente.
    browserGo(1);
    expect(view()).toBe('contacts');
    expect(len()).toBe('3');
  });
});
