import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

/**
 * Contrato seguro dos "detalhes de colegas" do Team Chat (#240-A).
 *
 * `useTeamMemberDetails` lia a tabela `profiles` direto, tanto no cabecalho da
 * conversa direta quanto na lista de membros do grupo. A leitura do perfil de
 * OUTRO colaborador em `profiles` e bloqueada por RLS para agentes (cada usuario
 * ve apenas o proprio perfil), entao a tela ficava sem dados. O caminho seguro ja
 * existente e a RPC `get_team_profiles` (SECURITY DEFINER, so agentes ativos).
 *
 * A RPC nao devolve `birthday`; o campo continua existindo no retorno do hook
 * porque a tela o consome, mas sempre `null` — nada de inventar aniversario.
 *
 * Este teste executa as DUAS `queryFn` do hook (direta e grupo). Com a
 * implementacao antiga ele fica vermelho: a RPC nao e chamada e `.from('profiles')`
 * e usado como fonte.
 */

type QueryConfig = {
  queryKey: unknown;
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
};

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  queries: [] as QueryConfig[],
}));

/** Builder chainavel para o caminho ANTIGO (`supabase.from('profiles')...`). */
function legacyProfilesBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: f.rpc, from: f.from },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: QueryConfig) => {
    f.queries.push(config);
    return { data: undefined, isLoading: false };
  },
}));

import { useTeamMemberDetails } from '@/hooks/team-chat/useTeamMemberDetails';

/** Linhas reais da RPC `get_team_profiles` (sem `birthday` no contrato). */
const RPC_ROWS = [
  {
    id: 'p-1',
    user_id: 'u-1',
    name: 'Ana Souza',
    email: 'ana@promo.test',
    avatar_url: null,
    role: 'agent',
    is_active: true,
    department: 'Comercial',
    job_title: 'Vendedora',
    phone: '+5511999990001',
    max_chats: 5,
    created_at: '2024-03-01T12:00:00.000Z',
  },
  {
    id: 'p-2',
    user_id: 'u-2',
    name: 'Bruno Lima',
    email: 'bruno@promo.test',
    avatar_url: 'https://cdn.promo.test/b.png',
    role: 'supervisor',
    is_active: true,
    department: 'Logistica',
    job_title: 'Supervisor',
    phone: null,
    max_chats: 10,
    created_at: '2023-01-05T08:30:00.000Z',
  },
  // Nao pertence a conversa: serve para provar a filtragem por ID.
  {
    id: 'p-9',
    user_id: 'u-9',
    name: 'Forasteiro',
    email: 'forasteiro@promo.test',
    avatar_url: null,
    role: 'agent',
    is_active: true,
    department: 'TI',
    job_title: 'Dev',
    phone: null,
    max_chats: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

function member(profileId: string, conversationId: string) {
  return {
    id: `m-${profileId}`,
    conversation_id: conversationId,
    profile_id: profileId,
    joined_at: '2024-01-01T00:00:00.000Z',
    last_read_at: null,
    is_muted: false,
  };
}

const directConversation = {
  id: 'conv-direct',
  type: 'direct',
  name: null,
  avatar_url: null,
  created_by: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  members: [member('p-1', 'conv-direct'), member('p-2', 'conv-direct')],
} as TeamConversation;

const groupConversation = {
  id: 'conv-group',
  type: 'group',
  name: 'Comercial',
  avatar_url: null,
  created_by: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  members: [member('p-1', 'conv-group'), member('p-2', 'conv-group')],
} as TeamConversation;

function captureQueries(conversation: TeamConversation, currentProfileId: string | null) {
  f.queries = [];
  renderHook(() => useTeamMemberDetails(conversation, currentProfileId));
  return f.queries;
}

async function runQueryFn(config: QueryConfig) {
  let out: unknown;
  await act(async () => {
    out = await config.queryFn();
  });
  return out;
}

describe('useTeamMemberDetails — colegas via RPC segura get_team_profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.from.mockImplementation(() => legacyProfilesBuilder());
    f.rpc.mockResolvedValue({ data: RPC_ROWS, error: null });
    f.queries = [];
  });

  it('conversa direta carrega o colega pela RPC e nunca por .from("profiles")', async () => {
    const queries = captureQueries(directConversation, 'p-1');
    expect(queries).toHaveLength(2);

    const profile = await runQueryFn(queries[0]);

    expect(f.rpc).toHaveBeenCalledWith('get_team_profiles');
    expect(f.from).not.toHaveBeenCalled();
    expect(profile).toEqual({
      id: 'p-2',
      name: 'Bruno Lima',
      email: 'bruno@promo.test',
      phone: null,
      avatar_url: 'https://cdn.promo.test/b.png',
      job_title: 'Supervisor',
      department: 'Logistica',
      role: 'supervisor',
      is_active: true,
      created_at: '2023-01-05T08:30:00.000Z',
      birthday: null,
    });
  });

  it('grupo carrega os membros pela RPC, filtrados pelos IDs da conversa', async () => {
    const queries = captureQueries(groupConversation, 'p-1');
    expect(queries).toHaveLength(2);

    const members = (await runQueryFn(queries[1])) as Array<Record<string, unknown>>;

    expect(f.rpc).toHaveBeenCalledWith('get_team_profiles');
    expect(f.from).not.toHaveBeenCalled();
    // Ordem da RPC preservada e o perfil de fora da conversa (p-9) descartado.
    expect(members.map((m) => m.id)).toEqual(['p-1', 'p-2']);
  });

  it('preserva os campos da RPC e devolve birthday null (fora do contrato seguro)', async () => {
    const queries = captureQueries(groupConversation, 'p-1');
    const members = (await runQueryFn(queries[1])) as Array<Record<string, unknown>>;

    expect(members[0]).toMatchObject({
      id: 'p-1',
      name: 'Ana Souza',
      email: 'ana@promo.test',
      phone: '+5511999990001',
      job_title: 'Vendedora',
      department: 'Comercial',
      role: 'agent',
      is_active: true,
      created_at: '2024-03-01T12:00:00.000Z',
    });
    expect(members.every((m) => m.birthday === null)).toBe(true);
  });

  it('direta: colega fora da RPC (inativo/ausente) resulta em null, sem cair para a tabela', async () => {
    f.rpc.mockResolvedValue({ data: [RPC_ROWS[2]], error: null });
    const queries = captureQueries(directConversation, 'p-1');

    const profile = await runQueryFn(queries[0]);

    expect(profile).toBeNull();
    expect(f.from).not.toHaveBeenCalled();
  });

  it('propaga o erro da RPC em vez de engolir a falha', async () => {
    const erro = new Error('rpc indisponivel');
    f.rpc.mockResolvedValue({ data: null, error: erro });
    const queries = captureQueries(groupConversation, 'p-1');

    await expect(runQueryFn(queries[1])).rejects.toThrow('rpc indisponivel');
  });
});
