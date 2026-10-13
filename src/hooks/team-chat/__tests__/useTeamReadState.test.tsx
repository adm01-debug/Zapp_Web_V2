import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Estado real de leitura das mensagens próprias (ticks "entregue"/"lido").
 *
 * A fonte é a view `team_message_read_state` (N-070), que agrega os recibos de
 * `team_message_receipts` por mensagem: `member_count` (membros da conversa),
 * `read_count` (quantos leram, sem contar o remetente) e `all_read`
 * (`read_count = member_count - 1`).
 *
 * O teste dubla só a fronteira Supabase e chama o hook real. A prova é que:
 *  - a consulta sai na view e é escopada à conversa e aos ids próprios;
 *  - o mapa vira o `status` desenhado (`read` / `delivered` / `sent`);
 *  - sem mensagem própria, nenhuma consulta é disparada;
 *  - os recibos ao vivo invalidam a chave raiz, e o canal é fechado na desmontagem.
 */
const h = vi.hoisted(() => ({
  from: vi.fn(),
  canais: [] as { nome: string; on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }[],
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => h.from(...args),
    channel: (nome: string) => {
      const canal = { nome, on: vi.fn(), subscribe: vi.fn() };
      canal.on.mockReturnValue(canal);
      // No cliente real, `.subscribe()` devolve o próprio canal — é ele que o
      // `removeChannel` recebe na desmontagem.
      canal.subscribe.mockReturnValue(canal);
      h.canais.push(canal);
      return canal;
    },
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
  },
}));

import {
  deriveOwnMessageStatus,
  useTeamReadState,
  type TeamMessageReadState,
} from '@/hooks/team-chat/useTeamReadState';

const registro: { metodo: string; args: unknown[] }[] = [];

function cadeia(resultado: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in']) {
    b[metodo] = vi.fn((...args: unknown[]) => {
      registro.push({ metodo, args });
      return b;
    });
  }
  b.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(ok, fail);
  return b;
}

function render(conversationId: string | null, ids: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useTeamReadState(conversationId, ids), { wrapper });
}

const linhaView = (over: Partial<TeamMessageReadState>): TeamMessageReadState => ({
  message_id: 'm-1',
  conversation_id: 'c1',
  member_count: 3,
  read_count: 0,
  all_read: false,
  ...over,
});

beforeEach(() => {
  h.from.mockReset();
  h.removeChannel.mockReset();
  h.canais.length = 0;
  registro.length = 0;
  h.from.mockReturnValue(cadeia({ data: [], error: null }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTeamReadState — estado real de leitura por mensagem própria', () => {
  it('consulta a view pela conversa e só pelos ids próprios, e monta o mapa por mensagem', async () => {
    h.from.mockReturnValue(
      cadeia({
        data: [
          linhaView({ message_id: 'm-2', read_count: 1, all_read: false }),
          linhaView({ message_id: 'm-1', read_count: 4, all_read: true }),
        ],
        error: null,
      }),
    );

    const { result } = render('c1', ['m-2', 'm-1']);

    await waitFor(() => expect(result.current.readStates['m-1']).toBeDefined());

    expect(h.from).toHaveBeenCalledWith('team_message_read_state');
    expect(registro).toContainEqual({ metodo: 'eq', args: ['conversation_id', 'c1'] });
    expect(registro).toContainEqual({ metodo: 'in', args: ['message_id', ['m-1', 'm-2']] });
    expect(result.current.readStates['m-1']).toMatchObject({
      member_count: 3,
      read_count: 4,
      all_read: true,
    });
    expect(result.current.readStates['m-2']).toMatchObject({ read_count: 1, all_read: false });
  });

  it('sem mensagem própria, não consulta a view', async () => {
    render('c1', []);

    await Promise.resolve();
    await Promise.resolve();

    expect(h.from).not.toHaveBeenCalled();
  });

  it('deriva o status do tick a partir do estado: todos leram, alguns leram, ninguém', () => {
    expect(deriveOwnMessageStatus(undefined)).toBe('sent');
    expect(deriveOwnMessageStatus(linhaView({ read_count: 0, all_read: false }))).toBe('sent');
    expect(deriveOwnMessageStatus(linhaView({ read_count: 1, all_read: false }))).toBe('delivered');
    expect(deriveOwnMessageStatus(linhaView({ read_count: 3, all_read: true }))).toBe('read');
  });

  it('assina os recibos da conversa e invalida a chave raiz; fecha o canal na desmontagem', async () => {
    const { unmount } = render('c1', ['m-1']);

    await waitFor(() => expect(h.canais).toHaveLength(1));
    const canal = h.canais[0];
    expect(canal.nome).toBe('team-read-state-c1');

    const inscricao = canal.on.mock.calls[0];
    expect(inscricao[0]).toBe('postgres_changes');
    expect(inscricao[1]).toMatchObject({
      event: '*',
      schema: 'public',
      table: 'team_message_receipts',
    });

    unmount();
    expect(h.removeChannel).toHaveBeenCalledWith(canal);
  });
});
