/**
 * X048 (TL-106) — quando papel `agent` tenta ?view=talkx, o ViewRouter exibe
 * TalkXNoPermissionState com o botão "Falar com o administrador", que navega
 * para `team-chat`, em vez do RestrictedView genérico.
 *
 * O botão só é desenhado quando `onContactAdmin` existe (kit/states.tsx): sem a
 * prop, a tela de sem-permissão do Talk X fica sem saída para o atendente.
 * Recuperado da PR #2548 (fechada sem merge pelo congelamento #2545).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockRoles: string[] = ['agent'];

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: mockRoles,
    permissions: [],
    loading: false,
    permissionsLoading: false,
  }),
}));

// Não é chamado neste cenário (a tela está bloqueada antes de montar o Talk X),
// mas fica mockado para o teste não depender de rede se a ordem mudar.
vi.mock('@/hooks/integrations/useTalkXServiceStatus', () => ({
  useTalkXServiceStatus: () => ({ whatsapp: { connected: null } }),
}));

import { ViewRouter } from '@/pages/ViewRouter';

function renderView(view: string, onNavigateTo = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onNavigateTo,
    ...render(
      <QueryClientProvider client={client}>
        <ViewRouter currentView={view} onNavigateTo={onNavigateTo} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  mockRoles = ['agent'];
});

describe('ViewRouter — talkx: sem permissão (X048)', () => {
  it('papel agent em ?view=talkx vê "Você não tem permissão para acessar Campanhas"', () => {
    renderView('talkx');

    expect(screen.getByText(/Você não tem permissão para acessar Campanhas/i)).toBeInTheDocument();
    // não deve cair no RestrictedView genérico
    expect(screen.queryByText('Acesso restrito')).toBeNull();
  });

  it('botão "Falar com o administrador" navega para team-chat', () => {
    const { onNavigateTo } = renderView('talkx');

    const btn = screen.getByRole('button', { name: /Falar com o administrador/i });
    fireEvent.click(btn);

    expect(onNavigateTo).toHaveBeenCalledWith('team-chat');
  });

  it('admin não cai na tela de bloqueio do talkx', () => {
    mockRoles = ['admin'];
    renderView('talkx');

    expect(screen.queryByText(/Você não tem permissão para acessar Campanhas/i)).toBeNull();
  });
});
