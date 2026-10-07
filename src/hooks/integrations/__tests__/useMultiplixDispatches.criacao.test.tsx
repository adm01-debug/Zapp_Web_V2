/**
 * R2-MOD-023 (item 400) — idempotencia da criacao do composer Multiplix.
 *
 * A RPC `multiplix_create_draft` (chamada pela edge `multiplix-audience`) e
 * idempotente por `client_request_id`, NAO por conteudo: duas chaves diferentes
 * geram dois disparos. O defeito medido aqui: quando a resposta da criacao
 * falhava (timeout/rede/5xx depois do commit), o hook descartava a chave
 * (`onSettled` limpa tambem no erro) e a proxima tentativa gerava uma chave
 * nova — criando um SEGUNDO disparo para o mesmo pedido.
 *
 * Prova: o mesmo pedido reenviado apos uma falha de resposta tem de reenviar o
 * MESMO `client_request_id` (a RPC devolveria o disparo ja criado); pedido
 * diferente, ou depois de um sucesso, tem de usar chave nova.
 */
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMultiplixDraft = vi.fn();
const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('../useMultiplixAudience', () => ({
  createMultiplixDraft: (...args: unknown[]) => createMultiplixDraft(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  useCreateMultiplixDispatch,
  type CreateMultiplixDispatchInput,
} from '@/hooks/integrations/useMultiplixDispatches';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const INPUT: CreateMultiplixDispatchInput = {
  name: 'Convite feira 2026',
  messageTemplate: 'Ola {{empresa}}!',
  companyIds: ['11111111-1111-4111-8111-111111111111'],
  startNow: false,
};

/** `client_request_id` de cada chamada que chegou a `createMultiplixDraft`. */
function sentKeys(): string[] {
  return createMultiplixDraft.mock.calls.map(
    (call) => (call[0] as { client_request_id: string }).client_request_id,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('useCreateMultiplixDispatch — idempotencia sobrevive a falha de resposta', () => {
  it('reenvia o MESMO client_request_id quando a resposta da criacao falha', async () => {
    createMultiplixDraft
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ dispatch_id: 'd1', recipient_count: 3, created: true });

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow('Failed to fetch');
    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 'd1',
      recipientCount: 3,
      created: true,
    });

    const keys = sentKeys();
    expect(createMultiplixDraft).toHaveBeenCalledTimes(2);
    expect(keys[0]).toBeTruthy();
    // Sem isso a RPC (idempotente por client_request_id) cria um 2o disparo.
    expect(keys[1]).toBe(keys[0]);
  });

  it('libera a chave depois do SUCESSO: um novo disparo recebe chave nova', async () => {
    createMultiplixDraft.mockResolvedValue({ dispatch_id: 'd1', recipient_count: 3, created: true });

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await result.current.mutateAsync(INPUT);
    await result.current.mutateAsync(INPUT);

    const keys = sentKeys();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('troca a chave quando o PEDIDO muda depois de uma falha (nao reenvia o disparo antigo)', async () => {
    createMultiplixDraft
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ dispatch_id: 'd2', recipient_count: 1, created: true });

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow('Failed to fetch');
    await expect(
      result.current.mutateAsync({ ...INPUT, messageTemplate: 'Outra mensagem' }),
    ).resolves.toEqual({ id: 'd2', recipientCount: 1, created: true });

    const keys = sentKeys();
    // Reaproveitar a chave aqui faria a RPC devolver o disparo antigo, com o
    // conteudo antigo, como se o novo pedido tivesse sido criado.
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('mantem a chave quando muda so o que fazer DEPOIS de criar (startNow)', async () => {
    createMultiplixDraft
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ dispatch_id: 'd1', recipient_count: 3, created: true });

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ ...INPUT, startNow: false })).rejects.toThrow('Failed to fetch');
    await expect(result.current.mutateAsync({ ...INPUT, startNow: true })).resolves.toEqual({
      id: 'd1',
      recipientCount: 3,
      created: true,
    });

    const keys = sentKeys();
    // Mesmo disparo (nome/mensagem/publico), so o pos-criacao mudou: chave nova
    // aqui criaria um SEGUNDO disparo identico.
    expect(keys[1]).toBe(keys[0]);
  });
});
