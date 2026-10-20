import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// t_638c8a1a: os quatro controles sem efeito do AgentsView (`Filtrar`, `Editar`,
// `Configurações`, `Desativar`) existiam apenas para ficar `disabled` com tooltip
// (ticket t_f2a68e4c). O cartão manda REMOVER o afordance em vez de mantê-lo sempre
// desabilitado, para o usuário não tentar clicar repetidamente num controle que
// nunca funciona. Como o cartão manda remover o código, o antigo teste destes
// controles (que provava o estado `disabled`) é substituído por este, que usa os
// MESMOS cinco casos para provar o contrato oposto — os controles NÃO existem mais
// e o que a tela mostrava (o atendente, as ações reais) continua lá.
//
// O teste monta o componente real e mocka só o hook que a tela consome
// (`@/hooks/crm/useAgents`, importado no topo do AgentsView).

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'agent-1',
        user_id: 'user-1',
        name: 'Ana Souza',
        email: 'ana@empresa.com',
        avatar_url: null,
        role: 'agent',
        job_title: null,
        department: null,
        phone: null,
        is_active: true,
        max_chats: 5,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-10-06T12:00:00.000Z',
        activeChats: 2,
        status: 'online',
        queues: [],
      },
    ],
    stats: { onlineCount: 1, awayCount: 0, offlineCount: 0, totalActiveChats: 2, totalAgents: 1 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// t_2939f5e5: o AgentsView passou a consumir também a carga por atendente (pendentes +
// último envio). Estes mocks preservam o contrato do teste — a tela continua provada com
// o componente real, sem tocar a rede (que a guarda de teste bloqueia).
vi.mock('@/hooks/agents/useAgentPendingCounts', () => ({
  useAgentPendingCounts: () => ({ pendingCounts: {}, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/agents/useAgentRecentSends', () => ({
  useAgentRecentSends: () => ({ recentSends: {}, isLoading: false, error: null, refetch: vi.fn() }),
}));

import { AgentsView } from '../AgentsView';

// PageHeader usa useNavigate/useLocation: a tela precisa de um Router.
// AgentsView compõe InviteAgentDialog/ConfigurePermissionsDialog, que usam
// react-query — daí o QueryClientProvider.
function renderAgentsView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AgentsView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AgentsView — controles sem efeito foram removidos (t_638c8a1a)', () => {
  it('o botão "Filtrar" não existe mais e o atendente continua na tela', () => {
    renderAgentsView();

    // O atendente continua listado: a remoção do controle não apagou conteúdo.
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();

    // O afordance morto não existe mais.
    expect(screen.queryByRole('button', { name: /Filtrar/ })).toBeNull();
    expect(screen.queryByText(/Filtrar/i)).toBeNull();
  });

  it('não há mais gatilho de menu de ações (aria-haspopup) por atendente', () => {
    renderAgentsView();

    const gatilho = screen
      .getAllByRole('button')
      .find((botao) => botao.getAttribute('aria-haspopup') === 'menu');
    expect(gatilho).toBeUndefined();
  });

  it('não há menu nem os itens Editar/Configurações/Desativar', () => {
    renderAgentsView();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Configurações/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Desativar/ })).toBeNull();
  });

  it('nenhum botão da tela oferece as ações removidas', () => {
    renderAgentsView();

    const rotulos = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    for (const morto of ['Filtrar', 'Editar', 'Configurações', 'Desativar']) {
      expect(rotulos.some((rotulo) => rotulo.includes(morto))).toBe(false);
    }
  });

  it('os controles que continuam válidos seguem presentes', () => {
    renderAgentsView();

    // Ações reais da tela não foram afetadas pela remoção.
    expect(screen.getByRole('button', { name: /Atualizar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar Atendente/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar atendentes/)).toBeInTheDocument();
  });
});
