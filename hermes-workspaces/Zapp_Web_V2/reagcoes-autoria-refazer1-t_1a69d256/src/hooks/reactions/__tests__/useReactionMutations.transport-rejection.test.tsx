/**
 * R2-INB-032 (cartão #326) — reação não pode confirmar a gravação local quando a
 * Evolution rejeita o transporte.
 *
 * Antes: `useReactionMutations` gravava/removia em `message_reactions` ANTES de chamar
 * `sendReaction`; quando o transporte rejeitava, o `catch` só registrava log, a mutation
 * resolvia e `onSuccess` invalidava `['message-reactions', messageId]` como se tivesse
 * dado certo — o badge local aparecia/sumia e o picker fechava sem o WhatsApp ter aceitado.
 *
 * Prova (vermelho antes, verde depois): a tabela `message_reactions` do teste é um
 * armazenamento em memória (`mocks.rows`) — é o que a tela lê para os badges e para o
 * `hasReacted` — e o transporte é o mock de `sendReaction`, rejeitado de propósito.
 *  - rejeição ao ADICIONAR → mutation rejeita, toast destrutivo, `rows` sem a reação e
 *    nenhuma invalidação de sucesso;
 *  - rejeição ao REMOVER → mutation rejeita, toast destrutivo e a reação que já existia
 *    continua em `rows`;
 *  - caminhos de controle (transporte aceito e ausência de contexto de transporte)
 *    preservam o contrato anterior: gravação local e invalidação da query.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ReactionRow = {
  message_id: string;
  user_id: string;
  contact_id: string;
  emoji: string;
};

const mocks = vi.hoisted(() => ({
  sendReaction: vi.fn(),
  toast: vi.fn(),
  /** Tabela `message_reactions` em memória — o que a tela lê (badges/hasReacted). */
  rows: [] as ReactionRow[],
  upsertCalls: [] as Array<Record<string, unknown>>,
  deleteCalls: [] as Array<Record<string, string>>,
  /** Quantas chamadas de transporte já tinham acontecido quando a escrita local rodou. */
  transportCallsAtLocalWrite: [] as number[],
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

  function reactionsTable() {
    return {
      upsert: (payload: ReactionRow, opts?: { onConflict?: string }) => {
        mocks.upsertCalls.push({ ...payload, onConflict: opts?.onConflict });
        mocks.transportCallsAtLocalWrite.push(mocks.sendReaction.mock.calls.length);
        const jaExiste = mocks.rows.some(
          (row) =>
            row.message_id === payload.message_id &&
            row.user_id === payload.user_id &&
            row.emoji === payload.emoji,
        );
        if (!jaExiste) mocks.rows.push({ ...payload });
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.single = () => Promise.resolve({ data: payload, error: null });
        return chain;
      },
      delete: () => {
        const filters: Record<string, string> = {};
        const chain: Record<string, unknown> = {};
        chain.eq = (column: string, value: string) => {
          filters[column] = value;
          return chain;
        };
        chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
          mocks.deleteCalls.push({ ...filters });
          mocks.transportCallsAtLocalWrite.push(mocks.sendReaction.mock.calls.length);
          const restantes = mocks.rows.filter((row) => !matches(row, filters));
          mocks.rows.splice(0, mocks.rows.length, ...restantes);
          return Promise.resolve({ error: null }).then(resolve, reject);
        };
        return chain;
      },
    };
  }

  return {
    supabase: {
      from: (table: string) => (table === 'messages' ? messagesTable() : reactionsTable()),
    },
  };
});

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendReaction: mocks.sendReaction }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useReactionMutations } from '../useReactionMutations';

const MESSAGE_ID = 'msg-1';
const PROFILE_ID = 'profile-1';
const CONTACT_ID = 'contact-1';
const EMOJI = '👍';

const TRANSPORT = {
  instanceName: 'instancia-1',
  contactJid: '5511999999999@s.whatsapp.net',
  externalId: 'wamid.EXTERNO',
};

function seedReacao(emoji = EMOJI) {
  mocks.rows.push({
    message_id: MESSAGE_ID,
    user_id: PROFILE_ID,
    contact_id: CONTACT_ID,
    emoji,
  });
}

function montar(options?: Parameters<typeof useReactionMutations>[2]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useReactionMutations(MESSAGE_ID, PROFILE_ID, options), {
    wrapper,
  });
  return { ...rendered, invalidateSpy };
}

beforeEach(() => {
  mocks.sendReaction.mockReset();
  mocks.toast.mockReset();
  mocks.rows.length = 0;
  mocks.upsertCalls.length = 0;
  mocks.deleteCalls.length = 0;
  mocks.transportCallsAtLocalWrite.length = 0;
});

describe('useReactionMutations — rejeição do transporte (R2-INB-032)', () => {
  it('adicionar: transporte rejeitado rejeita a mutation, avisa e não confirma reação local', async () => {
    mocks.sendReaction.mockRejectedValue(new Error('evolution 503'));
    const { result, invalidateSpy } = montar(TRANSPORT);

    await act(async () => {
      await expect(result.current.addMutation.mutateAsync(EMOJI)).rejects.toThrow('evolution 503');
    });

    expect(mocks.sendReaction).toHaveBeenCalledWith(
      'instancia-1',
      { remoteJid: TRANSPORT.contactJid, fromMe: false, id: TRANSPORT.externalId },
      EMOJI,
    );
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao adicionar reação',
      variant: 'destructive',
    });
    await waitFor(() => expect(result.current.addMutation.isError).toBe(true));
    expect(result.current.addMutation.isSuccess).toBe(false);
    // Nada confirmado localmente: a tabela que a tela lê continua vazia.
    expect(mocks.rows).toEqual([]);
    // Estratégia adotada: impedir a escrita local (o envio vem antes), não desfazer depois.
    expect(mocks.upsertCalls).toEqual([]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('adicionar: com transporte aceito grava localmente DEPOIS do envio e invalida a query', async () => {
    mocks.sendReaction.mockResolvedValue({ ok: true });
    const { result, invalidateSpy } = montar(TRANSPORT);

    await act(async () => {
      await result.current.addMutation.mutateAsync(EMOJI);
    });

    expect(mocks.sendReaction).toHaveBeenCalledTimes(1);
    // 1 chamada de transporte já feita quando a gravação local rodou ⇒ envio antes da escrita.
    expect(mocks.transportCallsAtLocalWrite).toEqual([1]);
    expect(mocks.rows).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, contact_id: CONTACT_ID, emoji: EMOJI },
    ]);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['message-reactions', MESSAGE_ID] });
  });

  it('adicionar: sem contexto de transporte continua gravando local (contrato preservado)', async () => {
    const { result, invalidateSpy } = montar();

    await act(async () => {
      await result.current.addMutation.mutateAsync(EMOJI);
    });

    expect(mocks.sendReaction).not.toHaveBeenCalled();
    expect(mocks.rows).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, contact_id: CONTACT_ID, emoji: EMOJI },
    ]);
    expect(mocks.upsertCalls).toEqual([
      {
        message_id: MESSAGE_ID,
        user_id: PROFILE_ID,
        contact_id: CONTACT_ID,
        emoji: EMOJI,
        onConflict: 'message_id,user_id,emoji',
      },
    ]);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['message-reactions', MESSAGE_ID] });
  });

  it('adicionar: contexto de transporte incompleto não chama a Evolution', async () => {
    const { result } = montar({ instanceName: 'instancia-1', contactJid: TRANSPORT.contactJid });

    await act(async () => {
      await result.current.addMutation.mutateAsync(EMOJI);
    });

    expect(mocks.sendReaction).not.toHaveBeenCalled();
    expect(mocks.rows).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, contact_id: CONTACT_ID, emoji: EMOJI },
    ]);
  });

  it('remover: transporte rejeitado rejeita a mutation, avisa e preserva a reação que existia', async () => {
    seedReacao();
    mocks.sendReaction.mockRejectedValue(new Error('evolution 503'));
    const { result, invalidateSpy } = montar(TRANSPORT);

    await act(async () => {
      await expect(result.current.removeMutation.mutateAsync(EMOJI)).rejects.toThrow(
        'evolution 503',
      );
    });

    expect(mocks.sendReaction).toHaveBeenCalledWith(
      'instancia-1',
      { remoteJid: TRANSPORT.contactJid, fromMe: false, id: TRANSPORT.externalId },
      '',
    );
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao remover reação',
      variant: 'destructive',
    });
    await waitFor(() => expect(result.current.removeMutation.isError).toBe(true));
    expect(result.current.removeMutation.isSuccess).toBe(false);
    // A reação local que existia antes continua lá.
    expect(mocks.rows).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, contact_id: CONTACT_ID, emoji: EMOJI },
    ]);
    expect(mocks.deleteCalls).toEqual([]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('remover: com transporte aceito remove localmente DEPOIS do envio e invalida a query', async () => {
    seedReacao();
    mocks.sendReaction.mockResolvedValue({ ok: true });
    const { result, invalidateSpy } = montar(TRANSPORT);

    await act(async () => {
      await result.current.removeMutation.mutateAsync(EMOJI);
    });

    expect(mocks.sendReaction).toHaveBeenCalledTimes(1);
    expect(mocks.transportCallsAtLocalWrite).toEqual([1]);
    expect(mocks.rows).toEqual([]);
    expect(mocks.deleteCalls).toEqual([
      { message_id: MESSAGE_ID, user_id: PROFILE_ID, emoji: EMOJI },
    ]);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['message-reactions', MESSAGE_ID] });
  });

  it('remover: sem contexto de transporte continua removendo local (contrato preservado)', async () => {
    seedReacao();
    const { result, invalidateSpy } = montar();

    await act(async () => {
      await result.current.removeMutation.mutateAsync(EMOJI);
    });

    expect(mocks.sendReaction).not.toHaveBeenCalled();
    expect(mocks.rows).toEqual([]);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['message-reactions', MESSAGE_ID] });
  });
});
