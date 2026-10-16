/**
 * R2-INB-032 (cartão #326) — contrato PÚBLICO de `useMessageReactions`.
 *
 * O consumidor (tela do inbox) não fala com `useReactionMutations` direto: ele chama
 * `addReaction`/`removeReaction` e lê a lista `reactions` do hook público
 * `useMessageReactions`. Este arquivo trava esse contrato quando o transporte (Evolution)
 * rejeita:
 *  - `addReaction('👍')` REJEITA (não resolve como sucesso);
 *  - a lista `reactions` NÃO ganha a reação depois da rejeição;
 *  - `removeReaction('👍')` com transporte rejeitado REJEITA e a reação que já existia
 *    continua visível na lista.
 *
 * Prova (vermelho sem t_09817526, verde com ela): a tabela `message_reactions` do teste é um
 * armazenamento em memória (`mocks.rows`) — é o que o hook lê para montar `reactions` — e o
 * transporte é o mock de `sendReaction`, rejeitado de propósito. Dois casos de controle
 * (transporte aceito) mostram que a lista é viva: com o envio aceito ela ganha/perde a reação,
 * o que prova que a ausência nos casos de rejeição vem do defeito, não de a lista ser inerte.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
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
  sendReaction: vi.fn(),
  toast: vi.fn(),
  /** Tabela `message_reactions` em memória — a fonte dos badges/`hasReacted` da tela. */
  rows: [] as ReactionRow[],
  upsertCalls: [] as Array<Record<string, unknown>>,
  deleteCalls: [] as Array<Record<string, string>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const matches = (row: ReactionRow, filters: Record<string, string>) =>
    Object.entries(filters).every(
      ([column, value]) => String(row[column as keyof ReactionRow]) === value,
    );

  function messagesTable() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: { contact_id: 'contact-1' }, error: null });
    return chain;
  }

  function profilesTable() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    // perfil do usuário logado (`my-profile-reactions`)
    chain.eq = () => ({
      maybeSingle: () => Promise.resolve({ data: { id: 'profile-1', name: 'Agente' }, error: null }),
    });
    // nomes dos autores das reações
    chain.in = (_column: string, ids: string[]) =>
      Promise.resolve({
        data: ids.map((id) => ({ id, name: id === 'profile-1' ? 'Agente' : 'Outro' })),
        error: null,
      });
    return chain;
  }

  function reactionsTable() {
    const chain: Record<string, unknown> = {};
    // leitura da lista: select('*').eq('message_id', id) → await
    chain.select = () => ({
      eq: (column: string, value: string) =>
        Promise.resolve({
          data: mocks.rows.filter((row) => String(row[column as keyof ReactionRow]) === value),
          error: null,
        }),
    });
    chain.upsert = (payload: Omit<ReactionRow, 'id' | 'created_at'>, opts?: { onConflict?: string }) => {
      mocks.upsertCalls.push({ ...payload, onConflict: opts?.onConflict });
      const jaExiste = mocks.rows.some(
        (row) =>
          row.message_id === payload.message_id &&
          row.user_id === payload.user_id &&
          row.emoji === payload.emoji,
      );
      if (!jaExiste) {
        mocks.rows.push({
          id: `r-${mocks.rows.length + 1}`,
          created_at: '2026-10-06T00:00:00.000Z',
          ...payload,
        });
      }
      const single: Record<string, unknown> = {};
      single.select = () => single;
      single.single = () => Promise.resolve({ data: payload, error: null });
      return single;
    };
    chain.delete = () => {
      const filters: Record<string, string> = {};
      const del: Record<string, unknown> = {};
      del.eq = (column: string, value: string) => {
        filters[column] = value;
        return del;
      };
      del.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        mocks.deleteCalls.push({ ...filters });
        const restantes = mocks.rows.filter((row) => !matches(row, filters));
        mocks.rows.splice(0, mocks.rows.length, ...restantes);
        return Promise.resolve({ error: null }).then(resolve, reject);
      };
      return del;
    };
    return chain;
  }

  return {
    supabase: {
      from: (table: string) =>
        table === 'messages' ? messagesTable() : table === 'profiles' ? profilesTable() : reactionsTable(),
      channel: () => {
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = () => ({ unsubscribe: vi.fn() });
        return ch;
      },
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendReaction: mocks.sendReaction }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useMessageReactions } from '@/hooks/chat/useMessageReactions';

const MESSAGE_ID = 'm1';
const PROFILE_ID = 'profile-1';
const EMOJI = '👍';

// contexto que liga o caminho do transporte (Evolution) no hook público
const TRANSPORT = {
  instanceName: 'instancia-1',
  contactJid: '5511999999999@s.whatsapp.net',
  externalId: 'wamid.EXTERNO',
};

function seedReacao(emoji = EMOJI) {
  mocks.rows.push({
    id: 'r-seed',
    message_id: MESSAGE_ID,
    user_id: PROFILE_ID,
    contact_id: 'contact-1',
    emoji,
    created_at: '2026-10-06T00:00:00.000Z',
  });
}

function montar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useMessageReactions(MESSAGE_ID, TRANSPORT), { wrapper });
  return { ...rendered, invalidateSpy };
}

/** Espera a lista pública carregar a partir da tabela em memória. */
async function listaCarregada(
  result: { current: ReturnType<typeof useMessageReactions> },
  tamanho: number,
) {
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await waitFor(() => expect(result.current.reactions).toHaveLength(tamanho));
}

beforeEach(() => {
  mocks.sendReaction.mockReset();
  mocks.toast.mockReset();
  mocks.rows.length = 0;
  mocks.upsertCalls.length = 0;
  mocks.deleteCalls.length = 0;
});

describe('useMessageReactions — rejeição do transporte no contrato público (R2-INB-032)', () => {
  it('adicionar: addReaction rejeita e a lista pública não ganha a reação', async () => {
    mocks.sendReaction.mockRejectedValue(new Error('evolution 503'));
    const { result, invalidateSpy } = montar();
    await listaCarregada(result, 0);

    await act(async () => {
      await expect(result.current.addReaction(EMOJI)).rejects.toThrow('evolution 503');
    });

    // o transporte foi chamado com o contexto do hook público
    expect(mocks.sendReaction).toHaveBeenCalledWith(
      TRANSPORT.instanceName,
      { remoteJid: TRANSPORT.contactJid, fromMe: false, id: TRANSPORT.externalId },
      EMOJI,
    );
    // nada foi confirmado localmente e a lista lida pelo consumidor continua sem a reação
    expect(mocks.rows).toEqual([]);
    expect(result.current.reactions).toEqual([]);
    expect(mocks.upsertCalls).toEqual([]);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao adicionar reação',
      variant: 'destructive',
    });
  });

  it('adicionar (controle): com o transporte aceito a lista pública ganha a reação', async () => {
    mocks.sendReaction.mockResolvedValue({ ok: true });
    const { result } = montar();
    await listaCarregada(result, 0);

    await act(async () => {
      await result.current.addReaction(EMOJI);
    });

    await waitFor(() => expect(result.current.reactions).toHaveLength(1));
    expect(result.current.reactions[0]).toMatchObject({
      message_id: MESSAGE_ID,
      user_id: PROFILE_ID,
      emoji: EMOJI,
      user_name: 'Agente',
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('remover: removeReaction rejeita e a reação que existia continua visível na lista', async () => {
    seedReacao();
    mocks.sendReaction.mockRejectedValue(new Error('evolution 503'));
    const { result, invalidateSpy } = montar();
    await listaCarregada(result, 1);
    expect(
      result.current.reactions.some((r) => r.emoji === EMOJI && r.user_id === PROFILE_ID),
    ).toBe(true);

    await act(async () => {
      await expect(result.current.removeReaction(EMOJI)).rejects.toThrow('evolution 503');
    });

    expect(mocks.sendReaction).toHaveBeenCalledWith(
      TRANSPORT.instanceName,
      { remoteJid: TRANSPORT.contactJid, fromMe: false, id: TRANSPORT.externalId },
      '',
    );
    // a reação preservada (nada removido no banco nem da lista pública)
    expect(mocks.rows).toHaveLength(1);
    expect(mocks.deleteCalls).toEqual([]);
    expect(
      result.current.reactions.some((r) => r.emoji === EMOJI && r.user_id === PROFILE_ID),
    ).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao remover reação',
      variant: 'destructive',
    });
  });

  it('remover (controle): com o transporte aceito a reação some da lista pública', async () => {
    seedReacao();
    mocks.sendReaction.mockResolvedValue({ ok: true });
    const { result } = montar();
    await listaCarregada(result, 1);

    await act(async () => {
      await result.current.removeReaction(EMOJI);
    });

    await waitFor(() => expect(result.current.reactions).toHaveLength(0));
    expect(mocks.deleteCalls).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, emoji: EMOJI },
    ]);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
