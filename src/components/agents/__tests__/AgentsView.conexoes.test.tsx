/**
 * t_b35c23b0 — a tela de Atendentes não dava visão rápida da saúde das conexões do
 * WhatsApp: o supervisor precisava abrir a tela de Conexões para saber se alguma
 * instância caiu. A V3 (`AgentsOperationsPage`, `agents-ops/ConnectionsHeader`) mostra
 * conectado / instável / desconectado no topo; a V2 não tinha esse cabeçalho.
 *
 * Prova: renderiza a TELA real (`AgentsView`) e mocka só a fonte de conexões da V2
 * (`useConnectionsHealth`, o store global de `whatsapp_connections`), que é o módulo
 * que a tela consome. Os estados de carregando, erro e vazio são exercitados pela
 * própria tela — nenhum componente é montado já no estado final.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  type Conexao = {
    id: string;
    name: string;
    phoneNumber: string | null;
    instanceId: string | null;
    status: string;
    isDefault: boolean;
    healthy: boolean;
  };
  const conexao = (
    id: string,
    status: string,
    instanceId: string | null = `inst-${id}`,
    extra: Partial<Conexao> = {},
  ): Conexao => ({
    id,
    name: `Conexão ${id}`,
    phoneNumber: null,
    instanceId,
    status,
    isDefault: false,
    healthy: status === 'connected',
    ...extra,
  });

  return {
    conexao,
    state: {
      connections: [] as Conexao[],
      loading: false,
      error: null as string | null,
    },
  };
});

// A tela consome a MESMA fonte de conexões da V2 (store global de whatsapp_connections).
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@test.com' }, session: null, loading: false }),
}));

vi.mock('@/hooks/connections/useConnectionsHealth', () => ({
  useConnectionsHealth: () => ({
    connections: h.state.connections,
    loading: h.state.loading,
    error: h.state.error,
    refetchConnections: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// A tela composta também consome a equipe e a carga por atendente; aqui só o
// cabeçalho de conexões importa, então estes contratos ficam neutros.
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
        activeChats: 1,
        status: 'online',
        queues: [],
      },
    ],
    stats: { onlineCount: 1, awayCount: 0, offlineCount: 0, totalActiveChats: 1, totalAgents: 1 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/agents/useAgentPendingCounts', () => ({
  useAgentPendingCounts: () => ({ pendingCounts: {}, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/agents/useAgentRecentSends', () => ({
  useAgentRecentSends: () => ({ recentSends: {}, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => ({}),
}));

import { AgentsView } from '@/components/agents/AgentsView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/agents']}>
      <QueryClientProvider client={qc}>
        <AgentsView />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AgentsView — cabeçalho de conexões do WhatsApp (t_b35c23b0)', () => {
  beforeEach(() => {
    h.state.connections = [];
    h.state.loading = false;
    h.state.error = null;
  });

  it('mostra, por conexão, o estado de saúde em texto: conectado, instável e desconectado', () => {
    h.state.connections = [
      h.conexao('A', 'connected'),
      h.conexao('B', 'connecting'),
      h.conexao('C', 'disconnected'),
    ];
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    // O nome exibido é a instância (a V3 usa instance_id ?? name).
    expect(within(cabecalho).getByText('inst-A')).toBeInTheDocument();
    expect(within(cabecalho).getByText('inst-B')).toBeInTheDocument();
    expect(within(cabecalho).getByText('inst-C')).toBeInTheDocument();
    // Estado em texto, não só em cor.
    expect(within(cabecalho).getByText('Conectado')).toBeInTheDocument();
    expect(within(cabecalho).getByText('Instável')).toBeInTheDocument();
    expect(within(cabecalho).getByText('Desconectado')).toBeInTheDocument();
  });

  it('resume quantas conexões estão de pé e quantas têm problema', () => {
    h.state.connections = [
      h.conexao('A', 'connected'),
      h.conexao('B', 'connected'),
      h.conexao('C', 'disconnected'),
    ];
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    expect(within(cabecalho).getByText('2 de 3')).toBeInTheDocument();
    expect(within(cabecalho).getByText(/1 com problema/)).toBeInTheDocument();
  });

  it('as conexões são uma lista navegável (teclado/leitor de tela), não só um aglomerado de cores', () => {
    h.state.connections = [h.conexao('A', 'connected'), h.conexao('B', 'disconnected')];
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    const lista = within(cabecalho).getByRole('list', { name: 'Conexões do WhatsApp' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
  });

  it('marca a conexão padrão sem inventar estado', () => {
    h.state.connections = [h.conexao('A', 'connected', 'inst-A', { isDefault: true })];
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    expect(within(cabecalho).getByText('Padrão')).toBeInTheDocument();
    expect(within(cabecalho).getByText('1 de 1')).toBeInTheDocument();
  });

  it('mostra o estado de carregando em vez de fingir que não há conexão', () => {
    h.state.loading = true;
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    expect(within(cabecalho).getByText('Carregando conexões…')).toBeInTheDocument();
    // Nada de "0 de 0" nem de vazio: a leitura não voltou ainda.
    expect(within(cabecalho).queryByText('Nenhuma conexão de WhatsApp cadastrada.')).toBeNull();
    expect(within(cabecalho).queryByText(/de \d/)).toBeNull();
  });

  it('mostra erro de leitura em vez de "nenhuma conexão cadastrada"', () => {
    h.state.error = 'permission denied';
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    expect(
      within(cabecalho).getByText('Não foi possível carregar as conexões do WhatsApp.'),
    ).toBeInTheDocument();
    expect(within(cabecalho).queryByText('Nenhuma conexão de WhatsApp cadastrada.')).toBeNull();
  });

  it('sem conexões, diz que não há nenhuma cadastrada', () => {
    h.state.connections = [];
    renderView();

    const cabecalho = screen.getByRole('region', { name: 'Saúde das conexões do WhatsApp' });
    expect(
      within(cabecalho).getByText('Nenhuma conexão de WhatsApp cadastrada.'),
    ).toBeInTheDocument();
  });
});
