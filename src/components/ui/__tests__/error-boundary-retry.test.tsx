/**
 * UK-14 — contrato de `ErrorBoundaryWithRetry`.
 *
 * Prova o boundary de módulo: os filhos passam quando não há erro; um erro
 * dispara o auto-retry com backoff exponencial (1 s, 2 s), com o aviso
 * "Tentando novamente... (n/max)"; esgotadas as tentativas, mostra o fallback
 * manual, e o botão manual remonta os filhos. Prova também o caminho especial
 * do erro de chunk: em vez de repetir o auto-retry (que só repetiria a rejeição
 * do lazy), o erro é RELANÇADO para o boundary global recarregar a página.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

import { ErrorBoundaryWithRetry } from '@/components/ui/error-boundary-retry';

vi.mock('@/components/errors/ErrorBoundary', () => ({
  isChunkLoadError: vi.fn(() => false),
  clearReloadFlag: vi.fn(),
}));

import { isChunkLoadError, clearReloadFlag } from '@/components/errors/ErrorBoundary';

let deveFalhar = true;

function Filho() {
  if (deveFalhar) throw new Error('boom no módulo');
  return <p>módulo carregado</p>;
}

let silenciar: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  deveFalhar = true;
  vi.clearAllMocks();
  vi.mocked(isChunkLoadError).mockReturnValue(false);
  silenciar = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  silenciar.mockRestore();
  cleanup();
});

describe('error-boundary-retry — contrato (UK-14)', () => {
  it('sem erro renderiza os filhos', () => {
    deveFalhar = false;
    render(
      <ErrorBoundaryWithRetry moduleName="Relatórios">
        <Filho />
      </ErrorBoundaryWithRetry>,
    );

    expect(screen.getByText('módulo carregado')).toBeInTheDocument();
  });

  it('erro dispara auto-retry com backoff 1 s → 2 s e depois o fallback manual', () => {
    vi.useFakeTimers();
    render(
      <ErrorBoundaryWithRetry moduleName="Relatórios">
        <Filho />
      </ErrorBoundaryWithRetry>,
    );

    // 1ª falha: agenda o retry em 1 s.
    expect(screen.getByText('Tentando novamente... (1/2)')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // 2ª falha: agenda o retry em 2 s.
    expect(screen.getByText('Tentando novamente... (2/2)')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Esgotou: cai no fallback manual.
    expect(screen.getByText('Erro ao carregar Relatórios')).toBeInTheDocument();
    expect(screen.getByText('Tentativas automáticas esgotadas (2). Tente manualmente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('onError é chamado a cada falha', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    render(
      <ErrorBoundaryWithRetry moduleName="Relatórios" onError={onError}>
        <Filho />
      </ErrorBoundaryWithRetry>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('com maxAutoRetries=0 vai direto ao fallback manual', () => {
    render(
      <ErrorBoundaryWithRetry moduleName="Relatórios" maxAutoRetries={0}>
        <Filho />
      </ErrorBoundaryWithRetry>,
    );

    expect(screen.getByText('Erro ao carregar Relatórios')).toBeInTheDocument();
    expect(screen.getByText('Tentativas automáticas esgotadas (0). Tente manualmente.')).toBeInTheDocument();
    expect(screen.queryByText(/Tentando novamente/)).toBeNull();
  });

  it('"Tentar novamente" reseta e remonta os filhos', () => {
    render(
      <ErrorBoundaryWithRetry moduleName="Relatórios" maxAutoRetries={0}>
        <Filho />
      </ErrorBoundaryWithRetry>,
    );
    expect(screen.queryByText('módulo carregado')).toBeNull();

    deveFalhar = false;
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));

    expect(screen.getByText('módulo carregado')).toBeInTheDocument();
  });

  it('erro de chunk é relançado (o retry aqui só repetiria a rejeição do lazy)', () => {
    vi.mocked(isChunkLoadError).mockReturnValueOnce(true);

    let lancou = false;
    try {
      render(
        <ErrorBoundaryWithRetry moduleName="Relatórios">
          <Filho />
        </ErrorBoundaryWithRetry>,
      );
    } catch {
      lancou = true;
    }

    expect(lancou).toBe(true);
    // Não deve cair no auto-retry nem no fallback manual deste boundary.
    expect(screen.queryByText(/Tentando novamente/)).toBeNull();
    expect(screen.queryByText('Erro ao carregar Relatórios')).toBeNull();
    // O reload é do boundary global; aqui não se limpa a flag nem recarrega.
    expect(clearReloadFlag).not.toHaveBeenCalled();
  });
});
