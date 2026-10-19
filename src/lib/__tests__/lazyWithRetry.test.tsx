import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense, type ComponentType } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

const reload = vi.fn();

function Conteudo() {
  return <div>conteudo carregado</div>;
}

describe('lazyWithRetry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('erro de chunk dispara a recarga e NAO repete a tentativa', async () => {
    const factory = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    );
    const Lazy = lazyWithRetry(factory as () => Promise<{ default: ComponentType }>);

    render(
      <ErrorBoundary>
        <Suspense fallback={<div>carregando</div>}>
          <Lazy />
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() =>
      expect(screen.getByText(/Atualização disponível/i)).toBeInTheDocument()
    );
    // Recarregar o chunk que o proximo build vai renomear nao resolve: uma
    // tentativa so, e a recarga levando para o deploy novo.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('erro transitorio de rede repete (backoff) e carrega sem recarregar a pagina', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockResolvedValue({ default: Conteudo });
    const Lazy = lazyWithRetry(factory as () => Promise<{ default: ComponentType }>);

    render(
      <Suspense fallback={<div>carregando</div>}>
        <Lazy />
      </Suspense>
    );

    expect(
      await screen.findByText('conteudo carregado', undefined, { timeout: 6000 })
    ).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });
});
