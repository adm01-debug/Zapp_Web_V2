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
 *  - nomes dos autores ⇒ 1 único `.in('id', …)` com a união dos user_ids de
 *    todos os blocos (150 mensagens em 2 blocos = 2 `.in` de reações + 1 de nomes);
 *  - id dentro do provider mas fora da lista consulta sozinho na hora, sem
 *    esperar o lote; id coberto fica `enabled:false` até ser semeado;
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
  /** Ids de cada `.in('id', ...)` em `profiles` (nomes dos autores). */
  profilesInCalls: [] as string[][],
  rows: [] as ReactionRow[],
  /** Quando setado, `.in()` devolve esta promise (controle do atraso do lote). */
  deferredIn: null as null | { promise: Promise<{ data: unknown; error: unknown }> },
  /** Blocos cujo `.in()` rejeita: o id do bloco que inclui um destes falha. */
  failInWhenIncludes: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const reactionsTable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => ({
      in: (_column: string, ids: string[]) => {
        mocks.inCalls.push(ids);
        if (mocks.failInWhenIncludes.some((id) => ids.includes(id))) {
          return Promise.reject(new Error('bloco off'));
        }
        if (mocks.deferredIn) {
          const deferred = mocks.deferredIn;
          mocks.deferredIn = null;
          return deferred.promise;
        }
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
      in: (_column: string, ids: string[]) => {
        mocks.profilesInCalls.push(ids);
        return Promise.resolve({
          data: ids.map((id) => ({ id, name: `Nome-${id}` })),
          error: null,
        });
      },
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import { ReactionsBatchProvider } from '../useBatchReactions';
import { useMessageReactions } from '@/hooks/chat/useMessageReactions';

/** Consumidor real: o mesmo hook que cada balão usa na tela. */
function ReactionsProbe({ messageId }: { messageId: string }) {
  const { reactions } = useMessageReactions(messageId, { disableRealtime: true });
  return <span data-testid={`reactions-${messageId}`} data-count={String(reactions.length)} />;
}

function ReactionsProbeWithApi({
  messageId,
  onReady,
}: {
  messageId: string;
  onReady: (api: ReturnType<typeof useMessageReactions>) => void;
}) {
  const api = useMessageReactions(messageId, { disableRealtime: true });
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return <span data-testid={`reactions-${messageId}`} data-count={String(api.reactions.length)} />;
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

function ageReactionCache(queryClient: QueryClient, ids: string[]) {
  for (const id of ids) {
    const key = ['message-reactions', id] as const;
    queryClient.setQueryData(key, queryClient.getQueryData(key) ?? [], {
      updatedAt: Date.now() - 31_000,
    });
  }
}

beforeEach(() => {
  mocks.inCalls.length = 0;
  mocks.eqCalls.length = 0;
  mocks.profilesInCalls.length = 0;
  mocks.rows.length = 0;
  mocks.deferredIn = null;
  mocks.failInWhenIncludes.length = 0;
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

  it('reação do realtime não é sobrescrita quando o lote responde atrasado após invalidate + refetch', async () => {
    let resolveBatch!: (value: { data: unknown; error: unknown }) => void;
    mocks.deferredIn = {
      promise: new Promise((resolve) => {
        resolveBatch = resolve;
      }),
    };
    let latestApi: ReturnType<typeof useMessageReactions> | null = null;
    const onReady = vi.fn((api: ReturnType<typeof useMessageReactions>) => {
      latestApi = api;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ReactionsBatchProvider messageIds={['m1']}>
          <ReactionsProbeWithApi messageId="m1" onReady={onReady} />
        </ReactionsBatchProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    await waitFor(() => expect(latestApi).not.toBeNull());

    // realtime na tela: invalida a chave; o refetch real do hook traz a reação fresca.
    const fresco: ReactionRow = {
      id: 'r-rt',
      message_id: 'm1',
      user_id: 'u-9',
      contact_id: null,
      emoji: '🔥',
      created_at: '2026-10-11T00:00:00.000Z',
    };
    mocks.rows.push(fresco);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['message-reactions', 'm1'] });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await latestApi!.refetch();
    });
    expect(mocks.eqCalls).toEqual(['m1']);
    await waitFor(() =>
      expect(queryClient.getQueryData(['message-reactions', 'm1'])).toEqual([
        { ...fresco, user_name: 'Nome-u-9' },
      ]),
    );

    // o lote atrasado responde com o snapshot ANTIGO (sem a reação) e não sobrescreve.
    await act(async () => {
      resolveBatch({ data: [], error: null });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['message-reactions', 'm1'])).toEqual([
        { ...fresco, user_name: 'Nome-u-9' },
      ]),
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
    expect(mocks.eqCalls).toEqual([]);
  });

  it('mensagem nova durante lote em voo não repete os ids iniciais', async () => {
    let resolveInitialBatch!: (value: { data: unknown; error: unknown }) => void;
    mocks.deferredIn = {
      promise: new Promise((resolve) => {
        resolveInitialBatch = resolve;
      }),
    };

    const { queryClient, ui, rerender } = renderConversation(['m1', 'm2']);
    await waitFor(() => expect(mocks.inCalls).toEqual([['m1', 'm2']]));

    rerender(ui(['m1', 'm2', 'm3']));

    await waitFor(() => expect(mocks.inCalls).toEqual([['m1', 'm2'], ['m3']]));
    expect(mocks.eqCalls).toEqual([]);

    await act(async () => {
      resolveInitialBatch({ data: [], error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm1'])).toBeDefined());
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm3'])).toBeDefined());
    expect(mocks.inCalls).toEqual([['m1', 'm2'], ['m3']]);
  });

  it('cache envelhecido: append consulta só o id novo e não reativa consultas por mensagem', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `m${index}`);
    const { queryClient, ui, rerender } = renderConversation(ids);

    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm49'])).toBeDefined());
    ageReactionCache(queryClient, ids);

    rerender(ui([...ids, 'm50']));

    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    expect(mocks.inCalls[1]).toEqual(['m50']);
    await flush();
    expect(mocks.eqCalls).toEqual([]);
  });

  it('cache envelhecido: prepend consulta só ids antigos adicionados e não reativa consultas por mensagem', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `m${index}`);
    const { queryClient, ui, rerender } = renderConversation(ids);

    await waitFor(() => expect(mocks.inCalls.length).toBe(1));
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm49'])).toBeDefined());
    ageReactionCache(queryClient, ids);

    rerender(ui(['old-0', 'old-1', ...ids]));

    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    expect(mocks.inCalls[1]).toEqual(['old-0', 'old-1']);
    await flush();
    expect(mocks.eqCalls).toEqual([]);
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

  it('nomes dos autores: UM `.in()` com a união dos user_ids de todos os blocos', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `m${index}`);
    // reações nos DOIS blocos, com autores diferentes
    mocks.rows.push(
      { id: 'r-1', message_id: 'm0', user_id: 'u-1', contact_id: null, emoji: '👍', created_at: '2026-10-11T00:00:00.000Z' },
      { id: 'r-2', message_id: 'm100', user_id: 'u-2', contact_id: null, emoji: '❤️', created_at: '2026-10-11T00:00:00.000Z' },
    );
    const { queryClient } = renderConversation(ids);

    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm100'])).toBeDefined());
    await flush();

    // 2 blocos de reações, mas UMA consulta de nomes com a união dos autores
    expect(mocks.profilesInCalls).toHaveLength(1);
    expect([...mocks.profilesInCalls[0]].sort()).toEqual(['u-1', 'u-2']);
    // nenhum hook por mensagem consultou sozinho
    expect(mocks.eqCalls).toEqual([]);
  });

  it('id fora da lista do provider consulta sozinho sem esperar o lote', async () => {
    let resolveBatch!: (value: { data: unknown; error: unknown }) => void;
    mocks.deferredIn = {
      promise: new Promise((resolve) => {
        resolveBatch = resolve;
      }),
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReactionsBatchProvider messageIds={['m1']}>
          <ReactionsProbe messageId="m-fora" />
          <ReactionsProbe messageId="m1" />
        </ReactionsBatchProvider>
      </QueryClientProvider>,
    );

    // o lote cobre m1 (travado enquanto pendente); m-fora não está na lista:
    // consulta solo na hora, sem esperar o lote
    await waitFor(() => expect(mocks.inCalls).toEqual([['m1']]));
    await waitFor(() => expect(mocks.eqCalls).toEqual(['m-fora']));

    await act(async () => {
      resolveBatch({ data: [], error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm1'])).toBeDefined());
    await flush();

    // m1 veio do lote; m-fora já tinha vindo sozinho — sem consulta extra
    expect(mocks.eqCalls).toEqual(['m-fora']);
  });

  it('bloco que falha libera fallback solo sem travar o bloco que passou', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `m${index}`);
    mocks.failInWhenIncludes.push('m0');
    mocks.rows.push(
      { id: 'r-100', message_id: 'm100', user_id: 'u-7', contact_id: null, emoji: '🎉', created_at: '2026-10-11T00:00:00.000Z' },
    );
    const { queryClient } = renderConversation(ids);

    // parte 1 (m0..m99) falha → m0 consulta sozinho; parte 2 (m100) vem do lote
    await waitFor(() => expect(mocks.inCalls.length).toBe(2));
    await waitFor(() => expect(mocks.eqCalls).toContain('m0'));
    await waitFor(() => expect(queryClient.getQueryData(['message-reactions', 'm100'])).toBeDefined());
    await flush();

    const seeded = queryClient.getQueryData(['message-reactions', 'm100']) as ReactionRow[];
    expect(seeded).toHaveLength(1);
    expect(mocks.eqCalls).not.toContain('m100');
    // o lote buscou os nomes uma vez só (união); os fallbacks sem reação não buscam nome
    expect(mocks.profilesInCalls).toEqual([['u-7']]);
  });
});
