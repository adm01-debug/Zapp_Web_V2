/**
 * R2-AUTH-020 (item 247) — a "Capacidade" do atendente contava TODO contato com
 * `assigned_to` preenchido como chat ativo. Contato resolvido/arquivado/excluído é
 * CADASTRO, não atendimento em curso: entrava na conta e a barra de capacidade (e o
 * card "Chats Ativos") ficava acima do real, escondendo quem tem folga e acusando de
 * sobrecarga quem não está.
 *
 * Prova: renderiza a TELA real (`AgentsView`) com o hook real (`useAgents`) e um
 * cliente Supabase mockado que aplica os MESMOS filtros que a consulta manda. Se a
 * consulta não filtra o episódio aberto, o mock devolve o cadastro inteiro e o teste
 * fica vermelho — que é exatamente o defeito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  const state = { presence: {} as Record<string, string> };

  const profiles = [
    {
      id: 'p1', user_id: 'u1', name: 'Alpha', email: 'alpha@exemplo.test', avatar_url: null,
      role: 'agent', job_title: null, department: null, phone: null, is_active: true,
      max_chats: 5, created_at: '', updated_at: '',
    },
    {
      id: 'p2', user_id: 'u2', name: 'Beta', email: 'beta@exemplo.test', avatar_url: null,
      role: 'agent', job_title: null, department: null, phone: null, is_active: true,
      max_chats: 10, created_at: '', updated_at: '',
    },
  ];

  // Cadastro de contatos: só o episódio ABERTO e não excluído é atendimento em curso.
  const contacts = [
    { id: 'c1', assigned_to: 'p1', conversation_status: 'open', deleted_at: null }, // conta p1
    { id: 'c2', assigned_to: 'p1', conversation_status: 'resolved', deleted_at: null }, // cadastro
    { id: 'c3', assigned_to: 'p1', conversation_status: 'archived', deleted_at: null }, // cadastro
    { id: 'c4', assigned_to: 'p1', conversation_status: 'open', deleted_at: '2026-01-02T00:00:00Z' }, // excluído
    { id: 'c5', assigned_to: 'p2', conversation_status: 'open', deleted_at: null }, // conta p2
    { id: 'c6', assigned_to: 'p2', conversation_status: 'waiting', deleted_at: null }, // cadastro
    { id: 'c7', assigned_to: null, conversation_status: 'open', deleted_at: null }, // sem responsável
  ];

  function resolveRows(table: string, filters: unknown[][]) {
    if (table === 'profiles') return profiles;
    if (table === 'queues') return [];
    if (table === 'queue_members') return [];
    if (table === 'contacts') {
      const statusPedido = filters.find((f) => f[0] === 'eq' && f[1] === 'conversation_status');
      const pedeNaoExcluido = filters.some((f) => f[0] === 'is' && f[1] === 'deleted_at');
      const pedeComResponsavel = filters.some((f) => f[0] === 'not' && f[1] === 'assigned_to');
      return contacts.filter(
        (c) =>
          (!pedeComResponsavel || c.assigned_to !== null) &&
          (!statusPedido || c.conversation_status === statusPedido[2]) &&
          (!pedeNaoExcluido || c.deleted_at === null),
      );
    }
    return [];
  }

  function makeQuery(table: string) {
    const filters: unknown[][] = [];
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (...a: unknown[]) => { filters.push(['eq', ...a]); return q; },
      not: (...a: unknown[]) => { filters.push(['not', ...a]); return q; },
      is: (...a: unknown[]) => { filters.push(['is', ...a]); return q; },
      in: (...a: unknown[]) => { filters.push(['in', ...a]); return q; },
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const all = resolveRows(table, filters);
        const data = from === null ? all.slice(0, 1000) : all.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

// A presença vem de `agent_presence` (via useAgentPresenceMap); aqui controlamos o mapa
// para o card "Chats Ativos" ser o único lugar da tela que mostra o total de 2.
vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => h.state.presence,
}));

import { AgentsView } from '@/components/agents/AgentsView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // MemoryRouter: o PageHeader da tela usa useNavigate/useLocation.
  return render(
    <MemoryRouter initialEntries={['/agents']}>
      <QueryClientProvider client={qc}>
        <AgentsView />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AgentsView — capacidade conta atendimento em curso, não cadastro (R2-AUTH-020)', () => {
  beforeEach(() => {
    h.state.presence = { u1: 'online' };
  });

  it('a barra de capacidade mostra só os episódios abertos do atendente', async () => {
    renderView();

    // p1 tem 4 contatos atribuídos no cadastro, mas só 1 conversa aberta (e não excluída).
    expect(await screen.findByText('1/5 chats')).toBeInTheDocument();
    expect(screen.queryByText('4/5 chats')).not.toBeInTheDocument();
    // p2: 1 aberta de 2 atribuídos.
    expect(screen.getByText('1/10 chats')).toBeInTheDocument();
    expect(screen.queryByText('2/10 chats')).not.toBeInTheDocument();
  });

  it('o card "Chats Ativos" soma o mesmo episódio aberto, não os contatos atribuídos', async () => {
    renderView();

    const rotulo = await screen.findByText('Chats Ativos');
    // O valor fica no <p> imediatamente antes do rótulo, no mesmo bloco do card.
    expect(rotulo.previousElementSibling?.textContent).toBe('2');
    expect(rotulo.previousElementSibling?.textContent).not.toBe('6');
  });
});
