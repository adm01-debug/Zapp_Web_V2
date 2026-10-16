import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/team-chat/queryKeys';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

/**
 * Contrato seguro dos "detalhes de colegas" do Team Chat (#240-A) + aniversários (HZ-28).
 *
 * `useTeamMemberDetails` lia a tabela `profiles` direto, tanto no cabeçalho da
 * conversa direta quanto na lista de membros do grupo. A leitura do perfil de
 * OUTRO colaborador em `profiles` é bloqueada por RLS para agentes, então a tela
 * ficava sem dados. O caminho seguro é a RPC `get_team_profiles`, exposta pelo
 * hook compartilhado `useTeamProfiles` (chave única `['team-profiles-rpc']`).
 *
 * A RPC de perfis NÃO devolve `birthday`; o aniversário vem da RPC `get_team_birthdays`
 * (HZ-28), que devolve SÓ dia e mês — o ano nunca chega ao front, então a idade não
 * aparece e o hook também não inventa um aniversário para quem não tem cadastro.
 *
 * Os testes executam as funções de busca de verdade (a do hook e a da RPC de
 * aniversário). Com a implementação antiga ficam vermelhos: ninguém chamava
 * `get_team_birthdays` e `birthday` era sempre `null`.
 */

type QueryConfig = {
  queryKey: unknown;
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
};

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  queries: [] as QueryConfig[],
  profiles: [] as unknown[],
  birthdays: new Map<string, { day: number; month: number }>(),
}));

/** Builder chainável para o caminho ANTIGO (`supabase.from('profiles')...`). */
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

/** Hook compartilhado da RPC `get_team_profiles`: devolve a lista inteira de ativos. */
vi.mock('@/hooks/crm/useTeamProfiles', () => ({
  useTeamProfiles: () => ({ data: f.profiles, isLoading: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: QueryConfig) => {
    f.queries.push(config);
    return { data: f.birthdays, isLoading: false };
  },
}));

import { useTeamMemberDetails } from '@/hooks/team-chat/useTeamMemberDetails';

/** Linhas reais da RPC `get_team_profiles` (sem `birthday` no contrato). */
const PROFILE_ROWS = [
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
    phone: '+551****0001',
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

function renderDetails(conversation: TeamConversation, currentProfileId: string | null) {
  f.queries = [];
  return renderHook(() => useTeamMemberDetails(conversation, currentProfileId));
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
    f.profiles = PROFILE_ROWS;
    f.birthdays = new Map();
    f.queries = [];
    f.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('conversa direta carrega o colega pela lista compartilhada e nunca por .from("profiles")', () => {
    const { result } = renderDetails(directConversation, 'p-1');

    expect(f.from).not.toHaveBeenCalled();
    expect(result.current.memberProfile).toEqual({
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

  it('grupo carrega os membros filtrados pelos IDs da conversa, na ordem da lista', () => {
    const { result } = renderDetails(groupConversation, 'p-1');
    const members = result.current.groupMembers;

    expect(f.from).not.toHaveBeenCalled();
    // Ordem da lista preservada e o perfil de fora da conversa (p-9) descartado.
    expect(members.map((m) => m.id)).toEqual(['p-1', 'p-2']);
  });

  it('preserva os campos da RPC e devolve birthday null para quem não tem cadastro', () => {
    const { result } = renderDetails(groupConversation, 'p-1');
    const members = result.current.groupMembers;

    expect(members[0]).toMatchObject({
      id: 'p-1',
      name: 'Ana Souza',
      email: 'ana@promo.test',
      phone: '+551****0001',
      job_title: 'Vendedora',
      department: 'Comercial',
      role: 'agent',
      is_active: true,
      created_at: '2024-03-01T12:00:00.000Z',
    });
    expect(members.every((m) => m.birthday === null)).toBe(true);
  });

  it('busca o aniversário na RPC get_team_birthdays e devolve só dia e mês (sem ano)', async () => {
    f.rpc.mockResolvedValue({
      data: [{ id: 'p-2', birthday_day: 5, birthday_month: 1 }],
      error: null,
    });
    // O hook consome o retorno da query; aqui ele é dado como já resolvido, e a
    // `queryFn` (que faz a chamada real) é executada logo abaixo para provar o contrato.
    f.birthdays = new Map([['p-2', { day: 5, month: 1 }]]);

    const { result } = renderDetails(groupConversation, 'p-1');

    expect(f.queries).toHaveLength(1);
    expect(f.queries[0].queryKey).toEqual(queryKeys.teamBirthdays());
    expect(f.queries[0].queryKey).toEqual(['team-birthdays-rpc']);
    // Alguns minutos, para a RPC da equipe inteira não repetir a cada conversa.
    expect(f.queries[0].staleTime).toBeGreaterThanOrEqual(60_000);
    expect(f.queries[0].enabled).toBe(true);

    const porPerfil = await runQueryFn(f.queries[0]);

    expect(f.rpc).toHaveBeenCalledWith('get_team_birthdays');
    expect(porPerfil).toEqual(new Map([['p-2', { day: 5, month: 1 }]]));

    // Nos perfis, o aniversário chega sem ano: só dia e mês.
    expect(result.current.groupMembers.map((m) => m.birthday)).toEqual([
      null,
      { day: 5, month: 1 },
    ]);
  });

  it('direta: colega fora da RPC (inativo/ausente) resulta em null, sem cair para a tabela', () => {
    f.profiles = [PROFILE_ROWS[2]];
    const { result } = renderDetails(directConversation, 'p-1');

    expect(result.current.memberProfile).toBeNull();
    expect(f.from).not.toHaveBeenCalled();
  });

  it('sem perfil logado não busca aniversários (a chave fica desabilitada)', () => {
    renderDetails(groupConversation, null);

    expect(f.queries).toHaveLength(1);
    expect(f.queries[0].enabled).toBe(false);
  });

  it('propaga o erro da RPC de aniversários em vez de engolir a falha', async () => {
    const erro = new Error('rpc indisponivel');
    f.rpc.mockResolvedValue({ data: null, error: erro });

    renderDetails(groupConversation, 'p-1');

    await expect(runQueryFn(f.queries[0])).rejects.toThrow('rpc indisponivel');
  });
});
