/**
 * PERFORMANCE — reações da conversa em UMA consulta.
 *
 * Antes: cada balão montava `MessageReactions`/`QuickReactionBar` e cada um
 * chamava `useMessageReactions(messageId)` → uma consulta a `message_reactions`
 * por mensagem ao abrir a conversa. Agora o `ReactionsBatchProvider` cobre todos
 * os ids numa consulta (blocos de 100) e semeia o cache por mensagem.
 *
 * A prova:
 *  - 50 mensagens ⇒ 1 único `.in('message_id', [...50])` e NENHUM
 *    `.eq('message_id', ...)` (o hook por mensagem não consulta sozinho);
 *  - reação que chegou do realtime (cache mais novo que o lote) NÃO é
 *    sobrescrita quando o lote responde atrasado;
 *  - mensagem nova faz um lote só dela, sem refazer a consulta das outras;
 *  - falha do lote não prende o carregando: o hook por mensagem assume.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string | null;
  contact_id: string | null;
  emoji: string;
  created_at: string;
};

const mocks = vi.hoisted(() => ({
  /** Ids de cada `.in('message_id', ...)` em `message_reactions`. */
  inCalls: [] as string[][],
  /** Ids de cada `.eq('message_id', ...)` em `message_reactions` (consulta por mensagem). */
  eqCalls: [] as string[],
  rows: [] as ReactionRow[],
  /** Quando setado, `.in()` devolve esta promise (controle do atraso do lote). */
  deferredIn: null as null | { promise: Promise<{ data: unknown; error: unknown }> },
}));

vi.mock('@/integrations/supabase/client', () => {
  const reactionsTable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => ({
      in: (_column: string, ids: string[]) => {
        mocks.inCalls.push(ids);
        if (mocks.deferredIn) return mocks.deferredIn.promise;
        return Promise.resolve({
          data: mocks.rows.filter((row) => ids.includes(row.message_id)),
          error: null,
        });
      },
      eq: (_column: string, value: string) => {
        mocks.eqCalls.push(value);
        return Promise.resolve({
          data: mocks.rows.filter((row) => row.message_id === value),
          error: null,
        });
      },
    });
    // Módulo exige as mutações; nenhum teste dispara reação aqui.
    chain.upsert = () => {
      const single: Record<string, unknown> = {};
      single.select = () => single;
      single.single = () => Promise.resolve({ data: {}, error: null });
      return single;
    };
    chain.delete = () => {
      const del: Record<string, unknown> = {};
      del.eq = () => del;
      del.then = (resolve: (value: unknown) => void) =>
        Promise.resolve({ error: null }).then(resolve);
      return del;
    };
    return chain;
  };

  const profilesTable = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { id: 'profile-1', name: 'Agente' }, error: null }),
      }),
      in: (_column: string, ids: string[]) =>
        Promise.resolve({
          data: ids.map((id) => ({ id, name: `Nome-${id}` })),
          error: null,
        }),
    }),
  });

  return {
    supabase: {
      from: (table: string) =>
        table === 'message_reactions'
          ? reactionsTable()
          : table === 'profiles'
            ? profilesTable()
            : { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) },
      channel: () => {
        const channel: Record<string, unknown> = {};
        channel.on = () => channel;
        channel.subscribe = () => ({ unsubscribe: vi.fn() });
        return channel;
      },
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendReaction: vi.fn() }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ReactionsBatchProvider } from '../useBatchReactions';
import { useMessageReactions } from '@/hooks/chat/useMessageReactions';

/** Consumidor real: o mesmo hook que cada balão usa na tela. */
function ReactionsProbe({ messageId }: { messageId: string }) {
  const { reactions } = useMessageReactions(messageId, { disableRealtime: true });
  return <span data-testid={`reactions-${messageId}`} data-count={String(reactions.length)} />;
}

function renderConversation(ids: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (list: string[]) => (
    <QueryClientProvider client={queryClient}>
      <ReactionsBatchProvider messageIds={list}>
        {list.map((id) => (
          <ReactionsProbe key={id} messageId={id} />
        ))}
      </ReactionsBatchProvider>
    </QueryClientProvider>
  );
  return { queryClient, ui, ...render(ui(ids)) };
}

/** Deixa filas micro/macrotarefas assentarem antes de conferir ausência de consulta. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mocks.inCalls.length = 0;
  mocks.eqCalls.length = 0;
  mocks.rows.length = 0;
  mocks.deferredIn = null;
});

describe('ReactionsBatchProvider — reações da conversa em uma consulta', () => {
  it('(controle) sem o provider, cada mensagem consulta sozinha — o defeito medido', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `m${index}`);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        {ids.map((id) => (
          <ReactionsProbe key={id} messageId={id} />
        ))}
      </QueryClientProvider>,
    );

    // antes da correção: 50 mensagens = 50 consultas por mensagem
    await waitFor(() => expect(mocks.eqCalls.length).toBe(50));
    expect(mocks.inCalls).toEqual([]);
  });

  it('50 mensagens: 1 consulta em lote e NENHUMA consulta por mensagem', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `m${index}`);
    const { queryClient } = renderConversation(ids);

    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm0'])).toBeDefined());
    await flush();

    expect(mocks.inCalls[0]).toHaveLength(50);
    // o hook por mensagem NUNCA consultou sozinho (nem antes nem depois do lote)
    expect(mocks.eqCalls).toEqual([]);
  });

  it('reação do realtime não é sobrescrita quando o lote responde atrasado', async () => {
    let resolveBatch!: (value: { data: unknown; error: unknown }) => void;
    mocks.deferredIn = {
      promise: new Promise((resolve) => {
        resolveBatch = resolve;
      }),
    };

    const { queryClient } = renderConversation(['m1']);
    await waitFor(() => expect(mocks.inCalls.length).toBe(1));

    // realtime: a tela invalida a chave e o dado fresco entra no cache (mais novo que o lote)
    const fresco: ReactionRow[] = [
      {
        id: 'r-rt',
        message_id: 'm1',
        user_id: 'u-9',
        contact_id: null,
        emoji: '🔥',
        created_at: '2026-10-11T00:00:00.000Z',
      },
    ];
    queryClient.setQueryData(['message-reactions', 'm1'], fresco);

    // o lote atrasado responde com o snapshot ANTIGO (sem a reação)
    await act(async () => {
      resolveBatch({ data: [], error: null });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['message-reactions', 'm1'])).toEqual(fresco),
    );
    expect(screen.getByTestId('reactions-m1').getAttribute('data-count')).toBe('1');
  });

  it('mensagem nova faz lote só dela, sem refazer a consulta das outras', async () => {
    const { ui, rerender } = renderConversation(['m1', 'm2']);

    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    expect(mocks.inCalls[0]).toEqual(['m1', 'm2']);

    rerender(ui(['m1', 'm2', 'm3']));

    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    expect(mocks.inCalls[1]).toEqual(['m3']);
  });

  it('quebra em blocos de 100 ids', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `m${index}`);
    renderConversation(ids);

    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    expect(mocks.inCalls[0]).toHaveLength(100);
    expect(mocks.inCalls[1]).toHaveLength(50);
  });

  it('falha do lote não prende o carregando: o hook por mensagem assume', async () => {
    mocks.deferredIn = { promise: Promise.reject(new Error('lote off')) };
    renderConversation(['m1']);

    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    await waitFor(() => expect(mocks.eqCalls).toEqual(['m1']));
  });
});
