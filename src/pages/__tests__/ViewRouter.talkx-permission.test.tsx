/**
 * X048 — ViewRouter: papel `agent` em `?view=talkx` vê TalkXNoPermissionState,
 * não a tela genérica "Acesso restrito". O botão "Falar com o administrador"
 * navega para a view `team-chat`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/auth/useAuth';

// agent não tem acesso à view talkx por definição (STAFF_ROLES = admin + supervisor)
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['agent'],
    permissions: [],
    loading: false,
    permissionsLoading: false,
  }),
}));

// navegar é efeito colateral: mockamos para capturar o destino
const mockNavigate = vi.fn();
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (view: string) => mockNavigate(view),
  useNavigationHistory: () => ({ navigateTo: mockNavigate }),
}));

import { ViewRouter } from '../ViewRouter';

function renderView(view: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/?view=${view}`]}>
          <ViewRouter currentView={view} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ViewRouter · X048 — permissão TalkX', () => {
  it('agent em ?view=talkx vê "Você não tem permissão para acessar Campanhas"', async () => {
    renderView('talkx');
    await waitFor(() =>
      expect(screen.getByText(/Você não tem permissão para acessar Campanhas/i)).toBeTruthy()
    );
    expect(screen.queryByText('Acesso restrito')).toBeNull();
  });

  it('"Falar com o administrador" navega para team-chat', async () => {
    mockNavigate.mockClear();
    renderView('talkx');
    const btn = await screen.findByRole('button', { name: /Falar com o administrador/i });
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith('team-chat');
  });

  it('agent em outra view restrita vê a tela genérica, não o estado de Campanhas', async () => {
    renderView('agents');
    await waitFor(() =>
      expect(screen.getByText('Acesso restrito')).toBeTruthy()
    );
    expect(screen.queryByText(/Campanhas/i)).toBeNull();
  });
});
