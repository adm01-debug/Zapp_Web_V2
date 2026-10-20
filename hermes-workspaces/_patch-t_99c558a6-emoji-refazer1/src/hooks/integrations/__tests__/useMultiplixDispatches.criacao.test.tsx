/**
 * F44 (absorve F08) — a criacao do disparo vive na edge de DOMINIO
 * `multiplix-dispatch`, acao `draft.create`: a MESMA edge que serve as leituras
 * e a que resolve `profiles.id`/escopo do JWT no servidor. Antes o hook criava
 * pela edge irma `multiplix-audience` (`create_draft`), deixando DOIS caminhos
 * de criacao para o mesmo disparo.
 *
 * R2-MOD-023 (item 400) — idempotencia da criacao do composer Multiplix.
 *
 * A RPC `multiplix_create_draft` (chamada pela edge) e idempotente por
 * `client_request_id`, NAO por conteudo: duas chaves diferentes geram dois
 * disparos. O defeito medido aqui: quando a resposta da criacao falhava
 * (timeout/rede/5xx depois do commit), o hook descartava a chave (`onSettled`
 * limpava tambem no erro) e a proxima tentativa gerava uma chave nova — criando
 * um SEGUNDO disparo para o mesmo pedido.
 *
 * Prova: (1) a criacao sai pela edge de dominio e o navegador so manda a
 * REFERENCIA do publico (company_ids), nunca destinatarios; (2) o teto de
 * destinatarios continua chegando como o erro NOMEADO que o composer confirma;
 * (3) o mesmo pedido reenviado apos uma falha de resposta reusa o MESMO
 * `client_request_id`.
 */
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  MultiplixOverLimitError,
} from '@/hooks/integrations/useMultiplixAudience';
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

type InvokeOptions = { body: { action: string; payload: Record<string, unknown> } };

/** Payload de cada chamada `draft.create` que chegou a edge. */
function draftPayloads(): Array<Record<string, unknown>> {
  return functionsInvoke.mock.calls
    .filter((call) => (call[1] as InvokeOptions)?.body?.action === 'draft.create')
    .map((call) => (call[1] as InvokeOptions).body.payload);
}

/** `client_request_id` de cada chamada que chegou a edge de criacao. */
function sentKeys(): string[] {
  return draftPayloads().map((payload) => payload.client_request_id as string);
}

const CREATED = { data: { data: { dispatch_id: 'd1', recipient_count: 3, created: true } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  functionsInvoke.mockResolvedValue(CREATED);
});

describe('useCreateMultiplixDispatch — criacao pela edge de dominio (F44)', () => {
  it('cria por `multiplix-dispatch`/`draft.create` mandando so a REFERENCIA do publico', async () => {
    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 'd1',
      recipientCount: 3,
      created: true,
    });

    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: {
        action: 'draft.create',
        payload: {
          name: 'Convite feira 2026',
          message_template: 'Ola {{empresa}}!',
          company_ids: INPUT.companyIds,
          contact_ids: [],
          client_request_id: expect.any(String),
          scheduled_at: null,
          confirm_over_limit: false,
        },
      },
      headers: { Authorization: 'Bearer tok-123' },
    });
    // O navegador NAO decide o destino: nada de destinatario no corpo.
    const payload = draftPayloads()[0];
    expect(payload).not.toHaveProperty('recipients');
    expect(payload).not.toHaveProperty('destino_e164');
    // E nao ha mais um segundo caminho de criacao (a edge irma nao e chamada).
    expect(functionsInvoke).not.toHaveBeenCalledWith('multiplix-audience', expect.anything());
  });

  it('reenvia o MESMO client_request_id quando a resposta da criacao falha', async () => {
    functionsInvoke
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(CREATED);

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow('Failed to fetch');
    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 'd1',
      recipientCount: 3,
      created: true,
    });

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    // Sem isso a RPC (idempotente por client_request_id) cria um 2o disparo.
    expect(keys[1]).toBe(keys[0]);
  });

  it('libera a chave depois do SUCESSO: um novo disparo recebe chave nova', async () => {
    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    await result.current.mutateAsync(INPUT);
    await result.current.mutateAsync(INPUT);

    const keys = sentKeys();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('troca a chave quando o PEDIDO muda depois de uma falha (nao reenvia o disparo antigo)', async () => {
    functionsInvoke
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ data: { data: { dispatch_id: 'd2', recipient_count: 1, created: true } }, error: null });

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

  it('mantem a chave quando muda so o que fazer DEPOIS de criar (startNow), e o start segue o disparo criado', async () => {
    functionsInvoke
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(CREATED);

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

    // O id devolvido pela edge e o que o `multiplix-send` recebe no start.
    await waitFor(() => expect(functionsInvoke).toHaveBeenCalledWith('multiplix-send', {
      body: { dispatchId: 'd1', action: 'start' },
      headers: { Authorization: 'Bearer tok-123' },
    }));
  });

  it('teto de destinatarios (F17) continua virando o erro nomeado que o composer confirma', async () => {
    functionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({
          error: 'multiplix_over_recipient_limit',
          count: 250,
          limit: 200,
          message: 'multiplix_over_recipient_limit: 250 acima do teto de 200',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
      },
    });

    const { result } = renderHook(() => useCreateMultiplixDispatch(), { wrapper: createWrapper() });

    const error = await result.current.mutateAsync(INPUT).catch((e: unknown) => e);
    // `MultiplixComposerDialog` decide a confirmacao explicita por `instanceof`:
    // trocar a classe por outra apagaria o dialogo de "Confirmar e criar".
    expect(error).toBeInstanceOf(MultiplixOverLimitError);
    expect((error as MultiplixOverLimitError).count).toBe(250);
    expect((error as MultiplixOverLimitError).limit).toBe(200);
  });
});
