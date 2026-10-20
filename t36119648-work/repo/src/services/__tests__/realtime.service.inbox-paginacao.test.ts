/**
 * Paginação da lista de conversas (carregar mais / rolagem infinita) — P1 hooks/Inbox.
 *
 * Dois critérios de pronto:
 *  1. nenhum contato fica fora da lista: 650 contatos são todos alcançáveis pelas
 *     páginas, sem repetir nem pular na borda;
 *  2. não lidas exatas para TODO contato exibido, sem depender da amostra global de
 *     mensagens: a amostra aqui está VAZIA (simula a janela truncada) e a contagem
 *     sai só do agregado do banco (get_inbox_contact_summaries).
 *
 * O mock de `contacts` respeita o cursor (`.or('updated_at.lt.…,and(updated_at.eq.…,id.lt.…)')`)
 * e o `.limit()` da página, como o PostgREST faria.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

import { RealtimeService, type ConversationsCursor } from '../realtime.service';
import { CONVERSATIONS_PAGE_SIZE } from '@/hooks/realtime/realtimeUtils';

const TOTAL_CONTATOS = 650;

// Índice cresce = contato mais antigo (updated_at DESC é a ordem da lista).
const CONTATOS = Array.from({ length: TOTAL_CONTATOS }, (_, i) => ({
  id: `c-${String(i).padStart(4, '0')}`,
  name: `Contato ${i}`,
  phone: `551199999${String(i).padStart(4, '0')}`,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) - i * 60_000).toISOString(),
  conversation_status: 'open',
  assigned_to: null,
  tags: [],
}));

// Não lidas POR CONTATO: valor que só o agregado do banco conhece (a amostra de
// mensagens do teste está vazia). Nenhum contato fica zerado.
const NAO_LIDAS = new Map(CONTATOS.map((c, i) => [c.id, (i % 5) + 1]));

const METODOS = [
  'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'or', 'not',
  'is', 'in', 'order', 'limit', 'range',
] as const;

/** Slice da página: aplica o cursor (`updated_at`,`id`) e o limite pedidos. */
function aplicarCursor(filtroOr: string | null, limite: number) {
  let lista = CONTATOS;
  if (filtroOr) {
    const m = filtroOr.match(/^updated_at\.lt\.(.+),and\(updated_at\.eq\.(.+),id\.lt\.(.+)\)$/);
    expect(m, `cursor em formato inesperado: ${filtroOr}`).not.toBeNull();
    const [, abaixoDe, mesmoUpdatedAt, abaixoDeId] = m!;
    lista = lista.filter(
      (c) => c.updated_at < abaixoDe || (c.updated_at === mesmoUpdatedAt && c.id < abaixoDeId),
    );
  }
  return lista.slice(0, limite);
}

/**
 * Corrente encadeável e "awaitable" como o PostgREST. Usada nas mensagens: a
 * amostra resolve sempre vazia.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainVazio(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  for (const metodo of METODOS) b[metodo] = vi.fn(() => b);
  b.single = vi.fn(async () => ({ data: null, error: null }));
  b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  b.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  return b;
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();

  from.mockImplementation((tabela: string) => {
    if (tabela === 'contacts') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      let filtroOr: string | null = null;
      let limite = Infinity;
      for (const metodo of METODOS) {
        b[metodo] = vi.fn((...args: unknown[]) => {
          if (metodo === 'or') filtroOr = args[0] as string;
          if (metodo === 'limit') limite = args[0] as number;
          return b;
        });
      }
      b.single = vi.fn(async () => ({ data: null, error: null }));
      b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      b.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: aplicarCursor(filtroOr, limite), error: null }).then(onFulfilled, onRejected);
      return { select: vi.fn(() => b) };
    }
    // messages: amostra global vazia (janela truncada) — a contagem não pode vir daqui.
    return { select: vi.fn(() => chainVazio()) };
  });

  rpc.mockImplementation(async (fn: string, args: { p_contact_ids: string[] }) => {
    if (fn !== 'get_inbox_contact_summaries') return { data: null, error: null };
    return {
      data: args.p_contact_ids.map((id) => {
        const contato = CONTATOS.find((c) => c.id === id);
        return {
          contact_id: id,
          unread_count: NAO_LIDAS.get(id) ?? 0,
          last_message_id: `m-${id}`,
          last_message_sender: 'contact',
          last_message_content: `Última de ${id}`,
          last_message_type: 'text',
          last_message_created_at: contato?.updated_at ?? '2026-10-01T00:00:00.000Z',
          last_message_is_read: false,
          last_message_external_id: `ext-${id}`,
          last_message_media_url: null,
          last_message_status: 'received',
        };
      }),
      error: null,
    };
  });
});

describe('RealtimeService.fetchConversationsPage — paginação da lista', () => {
  it('percorre TODOS os contatos por cursor, sem repetir nem pular nenhum', async () => {
    const vistos = new Set<string>();
    let cursor: ConversationsCursor | null = null;
    let paginas = 0;

    do {
      const page = await RealtimeService.fetchConversationsPage(cursor);
      paginas++;
      expect(page.conversations.length).toBeLessThanOrEqual(CONVERSATIONS_PAGE_SIZE);
      for (const conversa of page.conversations) {
        expect(vistos.has(conversa.contact.id), `contato repetido: ${conversa.contact.id}`).toBe(false);
        vistos.add(conversa.contact.id);
      }
      cursor = page.nextCursor;
      expect(paginas).toBeLessThanOrEqual(10); // trava anti-loop
    } while (cursor);

    expect(vistos.size).toBe(TOTAL_CONTATOS);
    // 650 = 3 páginas cheias + 1 de 50
    expect(paginas).toBe(Math.ceil(TOTAL_CONTATOS / CONVERSATIONS_PAGE_SIZE));
  });

  it('primeira página com 200 contatos e hasMore/nextCursor coerentes', async () => {
    const page = await RealtimeService.fetchConversationsPage(null);

    expect(page.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    // o cursor é a borda exata da página (último contato)
    const ultimo = page.conversations[page.conversations.length - 1];
    expect(page.nextCursor).toEqual({ updatedAt: ultimo.contact.updated_at, id: ultimo.contact.id });
  });

  it('não lidas exatas em todos os contatos exibidos, sem depender da amostra de mensagens', async () => {
    const page = await RealtimeService.fetchConversationsPage(null);

    for (const conversa of page.conversations) {
      expect(conversa.unreadCount).toBe(NAO_LIDAS.get(conversa.contact.id));
      // a amostra de mensagens está vazia: só o agregado dá conteúdo à conversa
      expect(conversa.messages.length).toBeGreaterThan(0);
      expect(conversa.lastMessage?.content).toBe(`Última de ${conversa.contact.id}`);
    }

    // o agregado foi consultado para TODA a página (não só para quem faltou na amostra)
    const idsConsulta = (rpc.mock.calls[0][1] as { p_contact_ids: string[] }).p_contact_ids;
    expect(idsConsulta).toHaveLength(CONVERSATIONS_PAGE_SIZE);
  });

  it('ordem determinística: updated_at DESC com desempate por id DESC', async () => {
    const page = await RealtimeService.fetchConversationsPage(null);

    const ordem = page.conversations.map((c) => ({ updatedAt: c.contact.updated_at, id: c.contact.id }));
    const esperado = [...ordem].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
    expect(ordem).toEqual(esperado);
  });

  it('última página fecha a paginação (hasMore false, sem cursor)', async () => {
    // 650 = 3 páginas cheias: a quarta tem 50 e encerra.
    let cursor: ConversationsCursor | null = null;
    let page = await RealtimeService.fetchConversationsPage(cursor);
    for (let i = 0; i < 3 && page.nextCursor; i++) {
      cursor = page.nextCursor;
      page = await RealtimeService.fetchConversationsPage(cursor);
    }

    expect(page.conversations).toHaveLength(50);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
