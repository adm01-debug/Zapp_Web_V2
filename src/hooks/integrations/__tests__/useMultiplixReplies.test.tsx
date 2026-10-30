/**
 * TL-044B — camada unica e tipada dos RETORNOS de um disparo Multiplix
 * (Sala de retornos, F84). Os testes chamam o HOOK REAL com o cliente Supabase
 * mockado (`supabase.functions.invoke` e a tabela `contacts`).
 *
 * O que fica provado:
 *  1. a leitura sai da action `status` da edge `multiplix-dispatch` (TL-044A),
 *     com o payload `{ dispatch_id }`, e a resposta do mock e EXATAMENTE a do
 *     contrato entregue por t_2e778ed3 (`data.by_recipient[].replied_at` e
 *     `.reply_attribution`);
 *  2. a lista e tipada: `contact_id`, `replied_at` e `reply_attribution` por
 *     retorno, com o contato derivado pelo TELEFONE na regra de
 *     `@/lib/calls/phone` (E.164 completo — sufixo de 8 digitos nunca casa);
 *  3. `status` distingue carregando, erro, lista vazia e "sem disparo": a tela
 *     consome sem heuristica (`replies: []` NAO quer dizer "sem retorno");
 *  4. contrato ausente (edge anterior a TL-044A), telefone ambiguo e falha na
 *     busca do contato nao viram dado inventado — falham alto ou devolvem null;
 *  5. resposta de um disparo anterior nao contamina o disparo seguinte.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();
const fromMock = vi.fn();
const contactsOrder = vi.fn();

/**
 * Instrumentacao da tabela `contacts`: quantas consultas sairam e quantas
 * ficaram em voo ao mesmo tempo (para provar o lote e o teto de simultaneas).
 */
const contactsStats = { queries: 0, inFlight: 0, maxInFlight: 0 };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { MultiplixDispatchEdgeError } from '@/hooks/integrations/useMultiplixDispatches';
import { useMultiplixReplies } from '@/hooks/integrations/useMultiplixReplies';

type ContactRow = { id: string; phone: string | null };

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

interface ContactsBuilder {
  select: () => ContactsBuilder;
  or: (filter: string) => ContactsBuilder;
  order: (column: string) => ContactsBuilder;
  limit: (max?: number) => Promise<{ data: ContactRow[]; error: { message: string } | null }>;
}

/**
 * Tabela `contacts` de mentira: casa pelo MESMO filtro textual que o hook
 * monta (`phone.eq.<variante>`, com `.order('id')` antes do `.limit()`), de
 * modo que `phoneQueryVariants` roda de verdade — inclusive a variante "sem o
 * nono digito" e o teto de candidatos.
 */
function mockContactsTable(rows: ContactRow[], error: { message: string } | null = null) {
  fromMock.mockImplementation((table: string) => {
    if (table !== 'contacts') throw new Error(`tabela inesperada no hook: ${table}`);
    let wanted: string[] = [];
    const builder: ContactsBuilder = {
      select: () => builder,
      or: (filter) => {
        wanted = filter.split(',').map((part) => part.replace(/^phone\.eq\./, ''));
        return builder;
      },
      order: (column) => {
        contactsOrder(column);
        return builder;
      },
      limit: async (max?: number) => {
        contactsStats.queries += 1;
        contactsStats.inFlight += 1;
        contactsStats.maxInFlight = Math.max(contactsStats.maxInFlight, contactsStats.inFlight);
        // Cede o turno: sem isso os lotes resolveriam na mesma pilha e o pico de
        // consultas simultaneas (teto de 3) nao apareceria.
        await new Promise((resolve) => setTimeout(resolve, 0));
        contactsStats.inFlight -= 1;
        const matched = rows.filter((row) => row.phone !== null && wanted.includes(row.phone));
        return { data: typeof max === 'number' ? matched.slice(0, max) : matched, error };
      },
    };
    return builder;
  });
}

/** Corpo devolvido pela edge `multiplix-dispatch` (jsonResponse): `{ data: ... }`. */
function statusResponse(byRecipient: Record<string, unknown>[]) {
  return { data: { data: { by_recipient: byRecipient } }, error: null };
}

/** Item de `data.by_recipient` na forma do contrato de t_2e778ed3. */
function recipientRow(overrides: Record<string, unknown> = {}) {
  return {
    recipient_id: 'r1',
    destino_e164: '+5511900000001',
    company_id: 'c1',
    company_name: 'Alfa',
    eligibility: 'eligible',
    total_items: 1,
    replied: 1,
    replied_at: null,
    reply_attribution: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  contactsStats.queries = 0;
  contactsStats.inFlight = 0;
  contactsStats.maxInFlight = 0;
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
});

describe('useMultiplixReplies — retornos de um disparo Multiplix', () => {
  it('le os retornos da action status com contact_id, replied_at e atribuicao', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', destino_e164: '+5511900000001', company_id: 'c1', company_name: 'Alfa', replied: 2, replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' }),
      recipientRow({ recipient_id: 'r2', destino_e164: '+5511900000002', company_id: 'c2', company_name: 'Beta', replied: 1, replied_at: '2026-10-01T10:06:30Z', reply_attribution: 'inferred' }),
      // Sem retorno: nao entra na lista (replied_at nulo).
      recipientRow({ recipient_id: 'r3', destino_e164: '+5511900000003', company_id: 'c3', company_name: 'Gama', replied: 0 }),
    ]));
    mockContactsTable([
      { id: 'c-alfa', phone: '+5511900000001' },
      { id: 'c-beta', phone: '+5511900000002' },
    ]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'status', payload: { dispatch_id: 'd1' } },
      headers: { Authorization: 'Bearer tok-123' },
    });

    // Mais recente primeiro; o destinatario sem retorno fica de fora.
    expect(result.current.replies).toHaveLength(2);
    expect(result.current.replies[0]).toEqual({
      recipient_id: 'r2',
      contact_id: 'c-beta',
      company_id: 'c2',
      company_name: 'Beta',
      destino_e164: '+5511900000002',
      replied_at: '2026-10-01T10:06:30Z',
      reply_attribution: 'inferred',
    });
    expect(result.current.replies[1]).toEqual({
      recipient_id: 'r1',
      contact_id: 'c-alfa',
      company_id: 'c1',
      company_name: 'Alfa',
      destino_e164: '+5511900000001',
      replied_at: '2026-10-01T10:05:00Z',
      reply_attribution: 'linked',
    });
    // O conjunto de candidatos sai determinista (o teto de 5 pode cortar).
    expect(contactsOrder).toHaveBeenCalledWith('id');
  });

  it('confirma lista vazia sem consultar contatos quando ninguem respondeu', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', replied: 0 }),
      recipientRow({ recipient_id: 'r2', destino_e164: '+5511900000002', replied: 0 }),
    ]));
    mockContactsTable([{ id: 'c-alfa', phone: '+5511900000001' }]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('empty'));
    expect(result.current.replies).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('nao vincula contato de mesmo final de 8 digitos e DDD diferente', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', destino_e164: '+5511988887777', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' }),
    ]));
    // Mesmo final 88887777, DDD diferente: a regra dura do modulo de telefone
    // proibe casar por sufixo — a tela nao pode abrir a conversa de outro contato.
    mockContactsTable([{ id: 'outro-ddd', phone: '+5521988887777' }]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.replies[0]?.contact_id).toBeNull();
  });

  it('nao escolhe contato quando mais de um casa com o telefone do retorno', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', destino_e164: '+5511988887777', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'inferred' }),
    ]));
    mockContactsTable([
      { id: 'y', phone: '+5511988887777' },
      { id: 'z', phone: '11988887777' },
    ]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.replies[0]?.contact_id).toBeNull();
  });

  it('pagina cheia de candidatos nao afirma contato unico (corte do PostgREST)', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', destino_e164: '+5511988887777', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' }),
    ]));
    // Cinco grafias do MESMO telefone (E.164, so digitos, tronco 0, 55+local e
    // sem o nono digito): o conjunto bateu no teto, pode haver candidato atras
    // dele — com o conjunto cortado a unicidade nao se afirma.
    mockContactsTable([
      { id: 'a', phone: '+5511988887777' },
      { id: 'b', phone: '11988887777' },
      { id: 'c', phone: '011988887777' },
      { id: 'd', phone: '551198887777' },
      { id: 'e', phone: '1198887777' },
    ]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.replies[0]?.contact_id).toBeNull();
  });

  it('fica idle (sem chamar a edge) quando nenhum disparo esta selecionado', () => {
    const { result } = renderHook(() => useMultiplixReplies(null), { wrapper: createWrapper() });

    expect(result.current.status).toBe('idle');
    expect(result.current.replies).toEqual([]);
    expect(functionsInvoke).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fica loading enquanto a resposta da edge nao chega', async () => {
    functionsInvoke.mockImplementation(() => new Promise(() => { /* pendente de proposito */ }));

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(functionsInvoke).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('loading');
    expect(result.current.replies).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('erro nomeado da edge vira status error com a mensagem do contrato', async () => {
    const context = new Response(JSON.stringify({ error: 'multiplix_dispatch_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('error'));
    const error = result.current.error as MultiplixDispatchEdgeError;
    expect(error).toBeInstanceOf(MultiplixDispatchEdgeError);
    expect(error.code).toBe('multiplix_dispatch_not_found');
    expect(result.current.replies).toEqual([]);
  });

  it('contrato sem os campos de retorno falha alto em vez de mentir lista vazia', async () => {
    // Edge anterior a TL-044A: `by_recipient` existe, mas sem `replied_at`.
    // Tratar isso como "ninguem respondeu" seria mentira silenciosa.
    functionsInvoke.mockResolvedValue(statusResponse([
      { recipient_id: 'r1', destino_e164: '+5511900000001', company_id: 'c1', company_name: 'Alfa', eligibility: 'eligible', replied: 1 },
    ]));

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect((result.current.error as MultiplixDispatchEdgeError).code).toBe('multiplix_replies_contrato');
  });

  it('falha na busca do contato nao vira contact_id nulo em silencio', async () => {
    functionsInvoke.mockResolvedValue(statusResponse([
      recipientRow({ recipient_id: 'r1', destino_e164: '+5511900000001', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' }),
    ]));
    mockContactsTable([{ id: 'c-alfa', phone: '+5511900000001' }], { message: 'permission denied' });

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect((result.current.error as Error).message).toContain('permission denied');
    expect(result.current.replies).toEqual([]);
  });

  it('resposta antiga nao contamina a lista do disparo seguinte', async () => {
    let resolveAntiga: ((value: unknown) => void) | undefined;
    functionsInvoke
      .mockImplementationOnce(() => new Promise((resolve) => { resolveAntiga = resolve; }))
      .mockResolvedValueOnce(statusResponse([
        recipientRow({ recipient_id: 'r2', destino_e164: '+5511900000002', replied_at: '2026-10-01T10:06:30Z', reply_attribution: 'inferred' }),
      ]));
    mockContactsTable([{ id: 'c-beta', phone: '+5511900000002' }]);

    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useMultiplixReplies(id), {
      wrapper: createWrapper(),
      initialProps: { id: 'd1' as string | null },
    });
    // A consulta do disparo d1 ja saiu (e continua pendente) antes da troca.
    await waitFor(() => expect(functionsInvoke).toHaveBeenCalledTimes(1));
    expect(functionsInvoke.mock.calls[0]?.[1]).toMatchObject({
      body: { action: 'status', payload: { dispatch_id: 'd1' } },
    });

    rerender({ id: 'd2' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.replies[0]?.recipient_id).toBe('r2');

    // A resposta do disparo ANTERIOR chega DEPOIS e nao pode reescrever a lista.
    await act(async () => {
      resolveAntiga?.(statusResponse([
        recipientRow({ recipient_id: 'r1', destino_e164: '+5511900000001', replied_at: '2026-10-01T10:00:00Z', reply_attribution: 'linked' }),
      ]));
    });
    await waitFor(() => expect(result.current.replies).toHaveLength(1));
    expect(result.current.replies[0]?.recipient_id).toBe('r2');
    expect(result.current.status).toBe('ready');
  });

  it('falha de recarga mantem a lista na tela e expoe o erro (nunca loading preso)', async () => {
    functionsInvoke
      .mockResolvedValueOnce(statusResponse([
        recipientRow({ recipient_id: 'r1', destino_e164: '+5511900000001', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' }),
      ]))
      .mockResolvedValueOnce({ data: null, error: { message: 'tempo esgotado' } });
    mockContactsTable([{ id: 'c-alfa', phone: '+5511900000001' }]);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { result.current.refetch(); });
    // A recarga realmente saiu (a falha e da segunda chamada, nao um refetch que
    // nem aconteceu) e so entao conferimos o estado exposto.
    await waitFor(() => expect(functionsInvoke).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.status).toBe('ready');
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.replies).toHaveLength(1);
    expect(result.current.replies[0]?.contact_id).toBe('c-alfa');
  });

  /** Telefone E.164 unico por indice (+55 + DDD 11 + 9 + 8 digitos). */
  function phoneAt(index: number): string {
    return `+5511${900000000 + index}`;
  }

  it('resolve centenas de telefones em poucas consultas, com no maximo 3 lotes em voo', async () => {
    const TOTAL = 250; // 5 lotes de 50 — nunca 250 consultas
    functionsInvoke.mockResolvedValue(statusResponse(
      Array.from({ length: TOTAL }, (_, i) => recipientRow({
        recipient_id: `r${i}`,
        destino_e164: phoneAt(i),
        replied: 1,
        replied_at: '2026-10-01T10:05:00Z',
        reply_attribution: 'linked',
      })),
    ));
    mockContactsTable(Array.from({ length: TOTAL }, (_, i) => ({ id: `c${i}`, phone: phoneAt(i) })));

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.replies).toHaveLength(TOTAL);
    // Uma consulta por lote de 50: 250 telefones = 5 consultas.
    expect(contactsStats.queries).toBe(5);
    // E no maximo 3 em voo ao mesmo tempo (nem 1, nem 5).
    expect(contactsStats.maxInFlight).toBe(3);
    expect(result.current.replies.every((reply) => reply.contact_id !== null)).toBe(true);
  });

  it('lote com pagina cheia nao vincula contato a nenhum telefone dele', async () => {
    // 50 telefones com 5 grafias cada = 250 linhas = teto do lote: o conjunto
    // pode ter sido cortado, entao o lote inteiro fica sem contato (a mesma
    // regra da pagina cheia por telefone).
    const TOTAL = 50;
    functionsInvoke.mockResolvedValue(statusResponse(
      Array.from({ length: TOTAL }, (_, i) => recipientRow({
        recipient_id: `r${i}`,
        destino_e164: phoneAt(i),
        replied: 1,
        replied_at: '2026-10-01T10:05:00Z',
        reply_attribution: 'inferred',
      })),
    ));
    const rows: ContactRow[] = [];
    for (let i = 0; i < TOTAL; i += 1) {
      const e164 = phoneAt(i);
      const local = e164.slice(3); // DDD + 9 + assinante
      rows.push(
        { id: `a${i}`, phone: e164 },
        { id: `b${i}`, phone: e164.slice(1) },
        { id: `c${i}`, phone: local },
        { id: `d${i}`, phone: `${local.slice(0, 2)}${local.slice(3)}` },
        { id: `e${i}`, phone: `0${local}` },
      );
    }
    mockContactsTable(rows);

    const { result } = renderHook(() => useMultiplixReplies('d1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(contactsStats.queries).toBe(1);
    expect(result.current.replies).toHaveLength(TOTAL);
    expect(result.current.replies.every((reply) => reply.contact_id === null)).toBe(true);
  });
});
