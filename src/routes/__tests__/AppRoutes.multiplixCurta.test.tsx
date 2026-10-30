import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/transitions', () => ({
  PageTransitionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// A sonda faz o papel do Index: mostra a URL e o tipo de navegação em que a tabela de rotas parou.
vi.mock('../../pages/Index', () => ({
  default: function IndexProbe() {
    const location = useLocation();
    const navType = useNavigationType();
    return (
      <div data-testid="index">
        <span data-testid="path">{location.pathname}</span>
        <span data-testid="search">{location.search}</span>
        <span data-testid="nav-type">{navType}</span>
      </div>
    );
  },
}));
vi.mock('../../pages/NotFound', () => ({ default: () => <div data-testid="not-found" /> }));
vi.mock('../../pages/Auth', () => ({ default: () => <div data-testid="auth" /> }));

import { AppRoutes } from '../AppRoutes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('AppRoutes — rota curta /multiplix', () => {
  it('normaliza /multiplix para /?view=multiplix sem empilhar histórico (REPLACE)', async () => {
    renderAt('/multiplix');

    await waitFor(() => expect(screen.getByTestId('index')).toBeInTheDocument());
    expect(screen.queryByTestId('not-found')).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    expect(screen.getByTestId('search')).toHaveTextContent('?view=multiplix');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
  });

  it('não altera a URL canônica /?view=multiplix', async () => {
    renderAt('/?view=multiplix');

    await waitFor(() => expect(screen.getByTestId('index')).toBeInTheDocument());
    expect(screen.getByTestId('search')).toHaveTextContent('?view=multiplix');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('POP');
  });
});
