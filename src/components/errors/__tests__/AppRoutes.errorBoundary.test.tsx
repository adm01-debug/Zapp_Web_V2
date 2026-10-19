/**
 * fix(app) — boundary das rotas com "Tentar novamente" e resetKey por rota
 * (cartao t_507786c4).
 *
 * Defeito original: `AppRoutes` envolvia todas as rotas num boundary de texto
 * fixo ("Erro ao carregar roteamento") sem botao e sem resetKey. Um erro numa
 * rota prendia o usuario naquele texto morto — navegar nao limpava nada.
 *
 * O que este arquivo trava:
 *  - trocar de rota muda o `resetKey` (pathname) e o erro e limpo, a tela nova
 *    renderiza;
 *  - "Tentar novamente" relanca a MESMA rota (sufixo no resetKey) quando a
 *    causa do erro sumiu.
 *
 * O arquivo mora em `components/errors/__tests__` porque o sujeito e o
 * ErrorBoundary aplicado pela tabela de rotas — os testes de AppRoutes em
 * `src/routes/__tests__` nao estao na lista de arquivos do cartao.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/transitions', () => ({
  PageTransitionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Estado da sonda de rota. `vi.hoisted` garante que existe antes das fabricas
// de mock (que sao elevadas ao topo do modulo).
const estado = vi.hoisted(() => ({
  index: 'ok' as 'ok' | 'quebrado' | 'sempre',
  liberar: false,
}));

vi.mock('../../../pages/Index', () => ({
  default: function IndexProbe() {
    if (estado.index === 'sempre') {
      throw new Error('Index sempre estoura');
    }
    if (estado.index === 'quebrado' && !estado.liberar) {
      throw new Error('Index estoura ate a causa sumir');
    }
    return <div data-testid="index">inicio</div>;
  },
}));
vi.mock('../../../pages/Auth', () => ({
  default: () => <div data-testid="auth">auth</div>,
}));
vi.mock('../../../pages/NotFound', () => ({
  default: () => <div data-testid="not-found" />,
}));

import { AppRoutes } from '../../../routes/AppRoutes';

function Navegador({ para }: { para: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(para)}>
      {`ir-para-${para}`}
    </button>
  );
}

describe('AppRoutes — boundary das rotas', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    estado.index = 'ok';
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('"Tentar novamente" relanca a mesma rota quando a causa sumiu', async () => {
    estado.index = 'quebrado';
    estado.liberar = false;

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const botao = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.queryByTestId('index')).toBeNull();

    // A causa do erro sumiu; o botao deve relancar a MESMA rota (pathname nao
    // muda, entao o resetKey precisa do sufixo de tentativa para resetar).
    estado.liberar = true;
    fireEvent.click(botao);

    await waitFor(() => expect(screen.getByTestId('index')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });

  it('trocar de rota limpa o erro e renderiza a tela nova', async () => {
    estado.index = 'sempre';

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
        <Navegador para="/auth" />
      </MemoryRouter>,
    );

    // A rota quebrada mostra o fallback com a saida.
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('ir-para-/auth'));

    await waitFor(() => expect(screen.getByTestId('auth')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });
});
