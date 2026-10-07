import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

// O boundary fala com o logger e com o reporter de erro (audit_logs). Nada disso
// importa aqui: o alvo do teste e a escolha do fallback.
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

// Filho que estoura no render — e o caso do overlay que quebra.
function OverlayQuebrado(): ReactNode {
  throw new Error('overlay quebrou');
}

describe('ErrorBoundary — escolha do fallback', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React imprime o erro capturado; silencia para o log do teste ficar legivel.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // #383 (R2-INF-041): `fallback={null}` e usado em App.tsx para RETIRAR o
  // overlay que falhou (`<ErrorBoundary fallback={null}>` sobre os providers
  // diferidos). Com o teste de veracidade (`if (this.props.fallback)`) o null
  // era tratado como "sem fallback" e a tela GLOBAL de erro ("Ops! Algo deu
  // errado", role="alert") era injetada no lugar do overlay — o app inteiro
  // perdia a interface por causa de um overlay que deveria apenas sumir.
  it('fallback={null} remove o overlay com falha sem pintar a tela global de erro', () => {
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <OverlayQuebrado />
      </ErrorBoundary>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Ops! Algo deu errado/i)).toBeNull();
  });

  it('fallback={false} tambem significa "nao renderize nada"', () => {
    const { container } = render(
      <ErrorBoundary fallback={false}>
        <OverlayQuebrado />
      </ErrorBoundary>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sem a prop fallback, mantem a tela global de erro (role="alert")', () => {
    render(
      <ErrorBoundary>
        <OverlayQuebrado />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
  });

  it('fallback customizado continua sendo respeitado', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="meu-fallback">caiu</div>}>
        <OverlayQuebrado />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('meu-fallback')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
