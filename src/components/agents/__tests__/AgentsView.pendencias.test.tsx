/**
 * t_2939f5e5 — a tela de Atendentes mostrava status, capacidade e busca, mas o
 * supervisor NÃO via a carga real da equipe: quantas conversas de cada atendente
 * estão aguardando resposta e quando cada um enviou pela última vez.
 *
 * Prova: renderiza a TELA real (`AgentsView`) com os hooks reais
 * (`useAgentPendingCounts`, `useAgentRecentSends`) e um cliente Supabase mockado que
 * aplica os MESMOS filtros que as consultas mandam. O mock também conta quantas
 * consultas cada tabela recebeu — a agregação exige UMA consulta para toda a equipe,
 * nunca uma por atendente.
 *
 * Réguas usadas (as canônicas, não novas):
 *  - "Pendente" é o mesmo filtro "Pendentes" da inbox (`useInboxFilters`):
 *    `contacts.conversation_status === 'waiting'`, contato atribuído e não excluído.
 *  - "Último envio" é `messages.sender === 'agent'`, dono em `messages.agent_id`,
 *    dentro da janela de envios recentes (LIMITE explicito, não o último lido).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RECENT_SENDS_WINDOW_DAYS } from '@/hooks/agents/useAgentRecentSends';

const h = vi.hoisted(() => {
  const HORA = 60 * 60 * 1000;
  const DIA = 24 * HORA;
  const agora = Date.now();
  const isoS = (ms: number) => new Date(ms).toISOString();

  const state = {
    queries: {} as Record<string, number>,
    createdAfter: null as string | null,
    failTable: null as string | null,
  };

  const profiles = [
    {
      id: 'p1', user_id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.test', avatar_url: null,
      role: 'agent', job_title: null, department: null, phone: null, is_active: true,
      max_chats: 5, created_at: '', updated_at: '',
    },
    {
      id: 'p2', user_id: 'u2', name: 'Bruno Lima', email: 'bruno@exemplo.test', avatar_url: null,
      role: 'agent', job_title: null, department: null, phone: null, is_active: true,
      max_chats: 5, created_at: '', updated_at: '',
    },
    {
      id: 'p3', user_id: 'u3', name: 'Carla Dias', email: 'carla@exemplo.test', avatar_url: null,
      role: 'agent', job_title: null, department: null, phone: null, is_active: true,
      max_chats: 5, created_at: '', updated_at: '',
    },
  ];

  // Cadastro de contatos. Só 'waiting' + atribuído + não excluído é conversa PENDENTE.
  const contacts = [
    { id: 'c1', assigned_to: 'p1', conversation_status: 'waiting', deleted_at: null }, // conta p1
    { id: 'c2', assigned_to: 'p1', conversation_status: 'waiting', deleted_at: null }, // conta p1
    { id: 'c3', assigned_to: 'p1', conversation_status: 'open', deleted_at: null }, // em curso, não pendente
    { id: 'c4', assigned_to: 'p1', conversation_status: 'waiting', deleted_at: '2026-01-02T00:00:00Z' }, // excluído
    { id: 'c5', assigned_to: 'p3', conversation_status: 'waiting', deleted_at: null }, // conta p3
    { id: 'c6', assigned_to: 'p2', conversation_status: 'resolved', deleted_at: null }, // cadastro
    { id: 'c7', assigned_to: null, conversation_status: 'waiting', deleted_at: null }, // espera da fila
  ];

  const envios = {
    p1Novo: isoS(agora - 2 * HORA),
    p1Antigo: isoS(agora - 5 * HORA),
    p3Novo: isoS(agora - 3 * DIA),
    p3Antigo: isoS(agora - 10 * DIA),
    p2ForaDaJanela: isoS(agora - 40 * DIA),
  };

  const messages = [
    { id: 'm1', sender: 'agent', agent_id: 'p1', created_at: envios.p1Antigo },
    { id: 'm2', sender: 'agent', agent_id: 'p1', created_at: envios.p1Novo },
    { id: 'm3', sender: 'agent', agent_id: 'p3', created_at: envios.p3Novo },
    { id: 'm4', sender: 'agent', agent_id: 'p3', created_at: envios.p3Antigo },
    { id: 'm5', sender: 'agent', agent_id: null, created_at: isoS(agora - 1 * HORA) }, // sem dono
    { id: 'm6', sender: 'contact', agent_id: 'p2', created_at: isoS(agora - 1 * HORA) }, // recebida, não envio
    { id: 'm7', sender: 'agent', agent_id: 'p2', created_at: envios.p2ForaDaJanela }, // fora da janela
  ];

  function resolveRows(table: string, filters: unknown[][]) {
    const has = (op: string, field: string) => filters.some((f) => f[0] === op && f[1] === field);
    const eq = (field: string) => filters.find((f) => f[0] === 'eq' && f[1] === field)?.[2];

    if (table === 'profiles') return profiles;
    if (table === 'contacts') {
      const status = eq('conversation_status');
      const pedeResponsavel = has('not', 'assigned_to');
      const pedeNaoExcluido = has('is', 'deleted_at');
      return contacts.filter(
        (c) =>
          (!pedeResponsavel || c.assigned_to !== null) &&
          (!status || c.conversation_status === status) &&
          (!pedeNaoExcluido || c.deleted_at === null),
      );
    }
    if (table === 'messages') {
      const sender = eq('sender');
      const pedeDono = has('not', 'agent_id');
      const depois = filters.find((f) => f[0] === 'gte' && f[1] === 'created_at')?.[2] as string | undefined;
      return messages.filter(
        (m) =>
          (!sender || m.sender === sender) &&
          (!pedeDono || m.agent_id !== null) &&
          (!depois || m.created_at >= depois),
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
      gte: (...a: unknown[]) => {
        filters.push(['gte', ...a]);
        if (table === 'messages' && a[0] === 'created_at') state.createdAfter = a[1] as string;
        return q;
      },
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        state.queries[table] = (state.queries[table] ?? 0) + 1;
        if (state.failTable === table) {
          return Promise.resolve(resolve({ data: null, error: { message: 'indisponível no teste' } }));
        }
        const all = resolveRows(table, filters);
        const data = from === null ? all.slice(0, 1000) : all.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery, envios };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => ({}),
}));

// t_227e36d1: o InviteAgentDialog (composto pela tela) lê o papel do usuário.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
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

/** Sobe do nome do atendente até o card que mostra "Pendentes". */
function cardDoAtendente(nome: string) {
  let node: HTMLElement | null = screen.getByRole('heading', { name: nome });
  while (node && !within(node).queryByText('Pendentes')) node = node.parentElement;
  if (!node) throw new Error(`card de ${nome} não encontrado`);
  return node;
}

describe('AgentsView — pendências e últimos envios por atendente (t_2939f5e5)', () => {
  beforeEach(() => {
    h.state.queries = {};
    h.state.createdAfter = null;
    h.state.failTable = null;
  });

  it('mostra as conversas aguardando de cada atendente pela régua "Pendentes" da inbox', async () => {
    renderView();

    await screen.findByText('Ana Souza');
    const ana = cardDoAtendente('Ana Souza');
    const carla = cardDoAtendente('Carla Dias');
    const bruno = cardDoAtendente('Bruno Lima');

    // p1: c1+c2 aguardando; c3 (open) é atendimento em curso e c4 está excluído.
    expect(within(ana).getByText('2 conversas')).toBeInTheDocument();
    // p3: uma só — e a tela escreve no singular.
    expect(within(carla).getByText('1 conversa')).toBeInTheDocument();
    // p2: nada aguardando (c6 está resolvido).
    expect(within(bruno).getByText('0 conversas')).toBeInTheDocument();
  });

  it('mostra o ÚLTIMO envio de cada atendente, não o primeiro lido nem um envio de outro', async () => {
    renderView();

    await screen.findByText('Ana Souza');
    const ana = cardDoAtendente('Ana Souza');
    const carla = cardDoAtendente('Carla Dias');
    const bruno = cardDoAtendente('Bruno Lima');

    // Ana tem dois envios (5h e 2h atrás): vale o MAIS RECENTE. O `title` traz o
    // horário exato, então o teste prova qual data foi escolhida, não só que "há algo".
    expect(within(ana).getByTitle(new Date(h.envios.p1Novo).toLocaleString('pt-BR'))).toBeInTheDocument();
    expect(within(ana).queryByTitle(new Date(h.envios.p1Antigo).toLocaleString('pt-BR'))).toBeNull();
    // Carla idem: 3 dias atrás vence 10 dias atrás.
    expect(within(carla).getByTitle(new Date(h.envios.p3Novo).toLocaleString('pt-BR'))).toBeInTheDocument();
    expect(within(carla).queryByText('Sem envio recente')).toBeNull();
    // Bruno só enviou 40 dias atrás, fora da janela: o rótulo é honesto, não uma data qualquer.
    expect(within(bruno).getByText('Sem envio recente')).toBeInTheDocument();
  });

  it('ordena os atendentes por pendências (maior carga primeiro)', async () => {
    renderView();

    await screen.findByText('Ana Souza');
    const nomes = screen
      .getAllByRole('heading', { level: 3 })
      .map((titulo) => titulo.textContent);

    // Ana (2) > Carla (1) > Bruno (0) — ordem diferente da alfabética, para provar que a
    // pendência é o critério.
    expect(nomes).toEqual(['Ana Souza', 'Carla Dias', 'Bruno Lima']);
  });

  it('lê a carga da equipe numa consulta agregada por tabela, não uma por atendente', async () => {
    renderView();

    await screen.findByText('Ana Souza');

    // profiles: 1 (equipe). contacts: a capacidade do useAgents + UMA agregação de
    // pendentes (3 atendentes ⇒ se fosse por atendente seriam 4). messages: 1.
    expect(h.state.queries.contacts).toBe(2);
    expect(h.state.queries.messages).toBe(1);
  });

  it('limita a leitura de envios à janela de envios recentes', async () => {
    renderView();

    await screen.findByText('Ana Souza');

    // A consulta de envios precisa pedir a janela ao banco (senão leria o histórico
    // inteiro): o corte pedido é de, no mínimo, RECENT_SENDS_WINDOW_DAYS atrás.
    expect(h.state.createdAfter).not.toBeNull();
    const corte = new Date(h.state.createdAfter as string).getTime();
    const limite = Date.now() - RECENT_SENDS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(corte).toBeGreaterThanOrEqual(limite - 5 * 60 * 1000);
    expect(corte).toBeLessThanOrEqual(Date.now());
  });

  it('não mostra 0 quando a leitura das pendências falha — mostra indisponível', async () => {
    h.state.failTable = 'contacts';
    renderView();

    await screen.findByText('Ana Souza');
    const ana = cardDoAtendente('Ana Souza');

    // Falha de leitura ≠ "0 conversas": contar zero é a informação errada. A tela diz
    // que não conseguiu carregar, em vez de dizer que o atendente está livre.
    expect(within(ana).getByText('—')).toBeInTheDocument();
    expect(within(ana).queryByText('0 conversas')).toBeNull();
  });

  it('não diz "Sem envio recente" quando a leitura dos envios falha — mostra indisponível', async () => {
    h.state.failTable = 'messages';
    renderView();

    await screen.findByText('Ana Souza');
    const ana = cardDoAtendente('Ana Souza');

    // "Sem envio recente" afirmaria que o atendente nada enviou; não é o caso, a
    // consulta é que não voltou. O rótulo honesto é indisponível.
    expect(within(ana).getByText('—')).toBeInTheDocument();
    expect(within(ana).queryByText('Sem envio recente')).toBeNull();
  });
});
