/**
 * fix(app) — auto-recuperacao que zera o contador (cartao t_507786c4).
 *
 * Defeito original: `AppProviders` contava 3 recuperacoes AUTOMATICAS e o
 * contador NUNCA voltava a zero (o ErrorBoundary da V2 nao tinha onReset).
 * Tres erros recuperados em qualquer momento da sessao somavam; o 4o derrubava
 * o app em "Falha Critica na Inicializacao" mesmo com tudo ja recuperado.
 *
 * O que este arquivo trava:
 *  - `ErrorBoundary.onReset` dispara na transicao erro -> ok e o contador do
 *    `AppProviders` volta a zero -> 4 erros ESPACADOS, cada um recuperado, nao
 *    derrubam o app (pre-fix: o 4o caia em "Falha Critica").
 *  - o boundary MAIS EXTERNO (`AppErrorBoundary`, montado em src/main.tsx
 *    acima do AppProviders) mostra a tela minima com "Recarregar" quando o
 *    proprio provider quebra — antes isso virava tela branca.
 *
 * A recuperacao automatica do AppProviders e um `setTimeout` de 2000 ms por
 * tentativa, por isso o teste usa timers reais e um teto generoso.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

// Dublê do cliente Supabase: a guarda de rede de src/test/setup.ts recusa
// falar com o projeto real, e a pilha do AppProviders monta o AuthProvider.
vi.mock('@/integrations/supabase/client', () => {
  const canal = {
    on: vi.fn(() => canal),
    subscribe: vi.fn(() => canal),
    unsubscribe: vi.fn(),
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn(() => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          or: vi.fn(() => builder),
          is: vi.fn(() => builder),
          in: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: (resolver: (valor: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolver),
        };
        return builder;
      }),
      channel: vi.fn(() => canal),
      removeChannel: vi.fn(async () => 'ok'),
    },
  };
});

const { AppProviders, AppErrorBoundary } = await import('../AppProviders');

/** Filho controlado: estoura no render enquanto `explodir` for true. */
function Filho({ explodir }: { explodir: boolean }) {
  if (explodir) {
    throw new Error('falha controlada do teste');
  }
  return <div data-testid="app-vivo">app vivo</div>;
}

/** Simula o proprio provider quebrando (o caso do boundary externo). */
function ProviderQuebrado(): never {
  throw new Error('AuthProvider quebrou no primeiro render');
}

describe('AppProviders — o contador de recuperacao zera a cada erro resolvido', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React imprime o erro capturado pelo boundary; silencia o ruido.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('4 erros espacados, cada um recuperado, nao derrubam o app', async () => {
    const { rerender } = render(
      <AppProviders>
        <Filho explodir={false} />
      </AppProviders>,
    );
    expect(screen.getByTestId('app-vivo')).toBeInTheDocument();

    for (let i = 1; i <= 4; i += 1) {
      // Erro: o boundary interno mostra o fallback global.
      rerender(
        <AppProviders>
          <Filho explodir />
        </AppProviders>,
      );
      await waitFor(() =>
        expect(screen.queryByText(/Ops! Algo deu errado/i)).toBeInTheDocument(),
      );

      // A causa some; a recuperacao automatica (2000 ms) reseta o boundary e,
      // com a correcao, chama onReset -> o contador volta a zero.
      rerender(
        <AppProviders>
          <Filho explodir={false} />
        </AppProviders>,
      );
      await waitFor(() => expect(screen.getByTestId('app-vivo')).toBeInTheDocument(), {
        timeout: 10_000,
      });
    }

    // Sem o reset, o 4o erro teria somado o limite e derrubado o app aqui.
    expect(screen.queryByText(/Falha Crítica/i)).toBeNull();
    expect(screen.getByTestId('app-vivo')).toBeInTheDocument();
  }, 60_000);
});

describe('AppErrorBoundary — boundary externo acima do AppProviders', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('erro no provider mostra a tela minima com "Recarregar" (nao tela branca)', () => {
    const { container } = render(
      <AppErrorBoundary>
        <ProviderQuebrado />
      </AppErrorBoundary>,
    );

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toHaveTextContent(/Nao foi possivel carregar o Zapp/i);
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    // Nao deixa passar como se fosse a tela global interna ("Ops!").
    expect(screen.queryByText(/Ops! Algo deu errado/i)).toBeNull();
  });

  it('"Recarregar" recarrega a pagina', () => {
    const reloadSpy = vi.fn();
    const localizacaoOriginal = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...localizacaoOriginal, reload: reloadSpy },
    });

    try {
      render(
        <AppErrorBoundary>
          <ProviderQuebrado />
        </AppErrorBoundary>,
      );
      screen.getByRole('button', { name: 'Recarregar' }).click();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: localizacaoOriginal,
      });
    }
  });
});
