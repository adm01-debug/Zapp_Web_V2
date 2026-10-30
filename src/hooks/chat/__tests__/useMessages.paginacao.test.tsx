import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// SL-099 — o GET de mensagens pedia 1000 linhas (o teto padrão do PostgREST) numa
// única requisição e, na conversa grande, o banco devolvia 500
// (`57014 statement timeout`): o chat abria sem histórico. Estes testes fixam o
// teto por requisição e provam que o histórico continua alcançável pela paginação
// por cursor (`loadOlderMessages` -> `fetchMessagesBefore`) e que as páginas já
// carregadas sobrevivem ao refetch silencioso.
const h = vi.hoisted(() => ({
  realtime: { config: null as unknown },
  fetchMessages: vi.fn(),
  fetchMessagesBefore: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: unknown) => { h.realtime.config = config; },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { fetchMessages: h.fetchMessages, fetchMessagesBefore: h.fetchMessagesBefore },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn(), rpc: vi.fn() },
}));

import { useMessages } from '@/hooks/chat/useMessages';
import type { MessageRow } from '@/types/chat';

const CONTACT = 'contact-1';
const T0 = Date.parse('2026-01-01T10:00:00Z');

/** Requisito do cartão: nenhuma requisição de mensagens pode pedir o teto de 1000
 *  linhas do PostgREST — era ela que voltava 500 (`57014 statement timeout`) na
 *  conversa grande. O teto aceito é 200 por requisição. */
const TETO_POR_REQUISICAO = 200;

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    contact_id: CONTACT,
    content: 'oi',
    sender: 'contact',
    created_at: new Date(T0).toISOString(),
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    ...overrides,
  } as MessageRow;
}

/** Página cheia: `size` mensagens em ordem cronológica crescente, como o serviço
 *  entrega depois de reverter o DESC do banco. */
function paginaCheia(size: number): MessageRow[] {
  return Array.from({ length: size }, (_, i) =>
    row({ id: `m${i}`, created_at: new Date(T0 + i * 60000).toISOString() }));
}

function montar() {
  return renderHook(() => useMessages({ contactId: CONTACT }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {children}
      </QueryClientProvider>
    ),
  });
}

/** Tamanho de página que o hook pediu de fato — o número vem do código de produção,
 *  não de uma constante repetida no teste. */
async function tamanhoPedido(): Promise<number> {
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  const view = montar();
  await waitFor(() => expect(h.fetchMessages).toHaveBeenCalled());
  const pedido = h.fetchMessages.mock.calls[0];
  expect(pedido[0]).toBe(CONTACT);
  expect(pedido[1]).toBe(0); // primeira página
  view.unmount();
  return pedido[2] as number;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — teto da página do GET de mensagens (SL-099)', () => {
  it('a carga inicial não pede o teto de 1000 linhas: fica dentro do orçamento por requisição', async () => {
    const pageSize = await tamanhoPedido();

    expect(pageSize).toBeGreaterThan(0);
    expect(pageSize).toBeLessThanOrEqual(TETO_POR_REQUISICAO);
  });

  it('com o teto menor o histórico continua inteiro: página cheia marca hasOlder e o lote anterior usa o mesmo teto', async () => {
    const pageSize = await tamanhoPedido();

    const primeira = paginaCheia(pageSize);
    h.fetchMessages.mockResolvedValueOnce({ data: primeira, error: null });
    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(pageSize));
    expect(view.result.current.hasOlder).toBe(true);

    const anterior = row({ id: 'anterior', created_at: new Date(T0 - 60000).toISOString() });
    h.fetchMessagesBefore.mockResolvedValueOnce({ data: [anterior], error: null });
    await act(async () => { await view.result.current.loadOlderMessages(); });

    // O cursor sai da mensagem mais antiga carregada e o lote anterior NÃO pede
    // mais que uma página (nenhuma consulta volta ao teto de 1000).
    expect(h.fetchMessagesBefore).toHaveBeenCalledWith(
      CONTACT,
      { createdAt: primeira[0].created_at, id: primeira[0].id },
      pageSize,
    );
    // ...e a mensagem anterior entra ANTES da mais antiga da primeira página.
    expect(view.result.current.messages.map((m) => m.id))
      .toEqual(['anterior', ...primeira.map((r) => r.id)]);
    // Um lote menor que o teto é o fim do histórico.
    expect(view.result.current.hasOlder).toBe(false);
  });

  it('as páginas antigas já carregadas sobrevivem ao refetch silencioso com o novo teto', async () => {
    const pageSize = await tamanhoPedido();

    const primeira = paginaCheia(pageSize);
    h.fetchMessages.mockResolvedValueOnce({ data: primeira, error: null });
    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(pageSize));

    const anterior = row({ id: 'anterior', created_at: new Date(T0 - 60000).toISOString() });
    h.fetchMessagesBefore.mockResolvedValueOnce({ data: [anterior], error: null });
    await act(async () => { await view.result.current.loadOlderMessages(); });
    expect(view.result.current.messages).toHaveLength(pageSize + 1);

    // Refetch pós-envio (silencioso): o banco devolve a mesma janela cheia e a
    // leitura autoritativa NÃO pode descartar o lote antigo que já estava na tela.
    h.fetchMessages.mockResolvedValueOnce({ data: paginaCheia(pageSize), error: null });
    await act(async () => { await view.result.current.refetch(); });

    expect(view.result.current.messages.map((m) => m.id))
      .toEqual(['anterior', ...primeira.map((r) => r.id)]);
  });
});
