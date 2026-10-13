import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * SL-016 (F54/F55) — a página de mensagens tem de sair da RPC
 * `get_team_messages_page` e a marcação de leitura da RPC
 * `mark_team_conversation_read`.
 *
 * Antes o hook lia `team_messages` direto (com embed de `profiles`) e gravava a
 * leitura em DOIS writes separados (`team_message_receipts` upsert +
 * `team_conversation_members` update) — se o segundo falhasse, a conversa ficava
 * meio-lida. Agora os três caminhos são RPC, e o teste prova que o cliente não
 * escreve mais nessas tabelas.
 */
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  page: [] as unknown[],
  pageError: null as unknown,
  readError: null as unknown,
  viewRows: [] as unknown[],
}));

/** Cadeia mínima da view de leitura: a única leitura direta que o hook faz. */
function cadeiaView() {
  const b: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in']) b[metodo] = vi.fn(() => b);
  b.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
    Promise.resolve({ data: h.viewRows, error: null }).then(ok, fail);
  return b;
}

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: h.rpc,
    from: h.from,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

function linha(over: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    conversation_id: 'conv-1',
    sender_id: 'profile-1',
    content: 'meu',
    message_type: 'text',
    reply_to_id: null,
    media_url: null,
    media_type: null,
    media_bucket: null,
    media_path: null,
    is_edited: false,
    created_at: '2026-10-08T14:00:00+00:00',
    updated_at: '2026-10-08T14:00:00+00:00',
    sender_name: 'Eu',
    sender_avatar: null,
    ...over,
  };
}

describe('useTeamMessages — página e marcação de leitura por RPC (SL-016)', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.from.mockReset();
    h.page = [];
    h.pageError = null;
    h.readError = null;
    h.viewRows = [];
    h.from.mockImplementation(() => cadeiaView());
    h.rpc.mockImplementation((nome: string) => {
      if (nome === 'get_team_messages_page') {
        return Promise.resolve({ data: h.page, error: h.pageError });
      }
      if (nome === 'mark_team_conversation_read') {
        return Promise.resolve({ data: null, error: h.readError });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('lê a página pela RPC (limite 200) e entrega em ordem crescente com o remetente montado', async () => {
    // A RPC devolve DESC (mais novas primeiro): a mais nova é 'm-2'.
    h.page = [
      linha({
        id: 'm-2',
        sender_id: 'profile-2',
        content: 'bom dia',
        created_at: '2026-10-08T15:00:00+00:00',
        sender_name: 'Ana',
        sender_avatar: 'https://x/a.png',
        media_bucket: 'team-chat-files',
        media_path: 'profile-2/conv-1/a.webm',
        media_type: 'audio',
      }),
      linha(),
    ];

    const { result } = renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    expect(h.rpc).toHaveBeenCalledWith('get_team_messages_page', {
      p_conversation_id: 'conv-1',
      p_limit: 200,
    });
    expect(result.current.messages.map(m => m.id)).toEqual(['m-1', 'm-2']);
    expect(result.current.messages[1]).toMatchObject({
      content: 'bom dia',
      media_bucket: 'team-chat-files',
      media_path: 'profile-2/conv-1/a.webm',
      media_type: 'audio',
      sender: { id: 'profile-2', name: 'Ana', avatar_url: 'https://x/a.png' },
    });
    // Nada de leitura direta da tabela de mensagens: a página vem inteira da RPC.
    // A única leitura direta do hook é a view de estado de leitura.
    expect(h.from).toHaveBeenCalledWith('team_message_read_state');
    expect(h.from).not.toHaveBeenCalledWith('team_messages');
    expect(h.from).not.toHaveBeenCalledWith('team_message_receipts');
  });

  it('marca a conversa como lida com uma RPC só, sem escrever nas tabelas', async () => {
    h.page = [linha({ id: 'm-2', sender_id: 'profile-2', content: 'oi' })];

    renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('mark_team_conversation_read', {
        p_conversation_id: 'conv-1',
      }),
    );
    // A leitura é gravada pela RPC: nenhum write direto nas tabelas.
    expect(h.from).not.toHaveBeenCalledWith('team_message_receipts');
    expect(h.from).not.toHaveBeenCalledWith('team_conversation_members');

    const marcas = h.rpc.mock.calls.filter(c => c[0] === 'mark_team_conversation_read');
    expect(marcas).toHaveLength(1);
  });

  it('não marca leitura quando só existem mensagens próprias', async () => {
    h.page = [linha()];

    const { result } = renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('get_team_messages_page', expect.anything()));

    expect(h.rpc.mock.calls.filter(c => c[0] === 'mark_team_conversation_read')).toHaveLength(0);
  });

  it('preenche o status das mensagens próprias com o estado real de leitura', async () => {
    h.page = [
      linha({ id: 'm-3', sender_id: 'profile-2', content: 'dela' }),
      linha({ id: 'm-2', sender_id: 'profile-1', content: 'meio lida' }),
      linha({ id: 'm-1', sender_id: 'profile-1', content: 'lida por todos' }),
      linha({ id: 'm-4', sender_id: 'profile-1', content: 'ninguém leu' }),
    ];
    h.viewRows = [
      linhaView({ message_id: 'm-1', read_count: 3, all_read: true }),
      linhaView({ message_id: 'm-2', read_count: 1, all_read: false }),
    ];

    const { result } = renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    await waitFor(() =>
      expect(
        Object.fromEntries(result.current.messages.map(m => [m.id, m.status])),
      ).toEqual({
        'm-1': 'read',
        'm-2': 'delivered',
        'm-3': undefined,
        'm-4': 'sent',
      }),
    );

    // A mensagem alheia não ganha status de tick: o tick é só da própria.
    expect(result.current.messages.find(m => m.id === 'm-3')?.status).toBeUndefined();
    expect(h.from).toHaveBeenCalledWith('team_message_read_state');
  });
});

const linhaView = (over: Record<string, unknown> = {}) => ({
  message_id: 'm-1',
  conversation_id: 'conv-1',
  member_count: 3,
  read_count: 0,
  all_read: false,
  ...over,
});
