/**
 * R2-INB-005 (P1 · area hooks/Inbox) — a janela GLOBAL de mensagens transformava
 * conversa ativa em histórico vazio e zero não lidas.
 *
 * A carga inicial da inbox pedia as 1000 (RECENT_MESSAGES_LIMIT) mensagens mais
 * recentes de TODOS os contatos e montava cada conversa apenas com o que caísse
 * nessa amostra global. Fixture com 1001 mensagens de dois contatos: A tem as 1000
 * que ocupam a janela e B fica inteiro fora dela — a conversa de B voltava com
 * `messages: []`, `lastMessage: null` e `unreadCount: 0`, e por isso desaparecia da
 * aba "abertas" (useInboxFilters exige `messages.length > 0`).
 *
 * A correção consulta o agregado POR CONTATO (get_inbox_contact_summaries): última
 * mensagem e não lidas direto do banco, sem inferir ausência de histórico de uma
 * amostra global. Contato sem nenhuma mensagem continua fora da lista (a amostra
 * vazia dele é verdadeira — não pode inflar a inbox).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

import { RealtimeService } from '../realtime.service';

// --- builder chainable que também registra as chamadas de filtro/limite -------
type Log = (metodo: string, args: unknown[]) => void;

const CADEIA = [
  'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'or', 'not',
  'is', 'in', 'order', 'limit', 'range',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(resultado: { data: unknown; error: unknown }, log?: Log): any {
  // Base PROMISE (e não objeto com `then` na mão): `await supabase.from(...)...`
  // resolve para { data, error } como o builder real do PostgREST.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = Object.assign(Promise.resolve(resultado), {
    single: vi.fn(async () => resultado),
    maybeSingle: vi.fn(async () => resultado),
  });
  for (const metodo of CADEIA) {
    b[metodo] = vi.fn((...args: unknown[]) => {
      log?.(metodo, args);
      return b;
    });
  }
  return b;
}

// --- fixture: 1001 mensagens de dois contatos --------------------------------
const CONTATO_A = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Contato A',
  phone: '5511999990001',
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-10-05T09:00:00.000Z',
  conversation_status: 'open',
  assigned_to: null,
  tags: [],
};

const CONTATO_B = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  name: 'Contato B',
  phone: '5511999990002',
  created_at: '2026-08-02T10:00:00.000Z',
  updated_at: '2026-10-04T09:00:00.000Z',
  conversation_status: 'open',
  assigned_to: null,
  tags: [],
};

const AS_1000_DE_A = Array.from({ length: 1000 }, (_, i) => ({
  id: `a-${String(i).padStart(4, '0')}`,
  contact_id: CONTATO_A.id,
  sender: 'contact',
  content: `A ${i}`,
  message_type: 'text',
  is_read: i < 3 ? false : true,
  created_at: new Date(Date.UTC(2026, 9, 5, 9, 0, 0) - i * 60_000).toISOString(),
  external_id: `wamid.a.${i}`,
}));

const ULTIMA_DE_B = {
  id: 'b-0001',
  contact_id: CONTATO_B.id,
  sender: 'contact',
  content: 'B fora da janela global',
  message_type: 'text',
  is_read: false,
  created_at: '2026-10-05T08:56:00.000Z',
  external_id: 'wamid.b.1',
};

const LIMITE_GLOBAL = 1000;

let limitePedidoEmMessages: unknown[] | undefined;

function montarCenario(opcoes: {
  contatos?: unknown[];
  mensagens?: unknown[];
  resumos?: unknown[];
  resumoErro?: unknown;
  resumoLanca?: boolean;
} = {}) {
  const contatos = opcoes.contatos ?? [CONTATO_A, CONTATO_B];
  const mensagens = opcoes.mensagens ?? AS_1000_DE_A;

  from.mockImplementation((tabela: string) => {
    if (tabela === 'messages') {
      return builder({ data: mensagens, error: null }, (metodo, args) => {
        if (metodo === 'limit') limitePedidoEmMessages = args;
      });
    }
    return builder({ data: contatos, error: null });
  });

  rpc.mockImplementation(async (fn: string) => {
    if (fn !== 'get_inbox_contact_summaries') return { data: null, error: null };
    if (opcoes.resumoLanca) throw new TypeError('supabase.rpc is not a function');
    if (opcoes.resumoErro) return { data: null, error: opcoes.resumoErro };
    return {
      data: opcoes.resumos ?? [{
        contact_id: CONTATO_B.id,
        unread_count: 1,
        last_message_id: ULTIMA_DE_B.id,
        last_message_sender: ULTIMA_DE_B.sender,
        last_message_content: ULTIMA_DE_B.content,
        last_message_type: ULTIMA_DE_B.message_type,
        last_message_created_at: ULTIMA_DE_B.created_at,
        last_message_is_read: ULTIMA_DE_B.is_read,
        last_message_external_id: ULTIMA_DE_B.external_id,
        last_message_media_url: null,
        last_message_status: 'sent',
      }],
      error: null,
    };
  });
}

const conversaDe = (conversas: Awaited<ReturnType<typeof RealtimeService.fetchInitialConversations>>, id: string) =>
  conversas.find((c) => c.contact.id === id);

describe('RealtimeService.fetchInitialConversations — janela global (R2-INB-005)', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    limitePedidoEmMessages = undefined;
  });

  it('preserva B e sua contagem quando as 1000 mensagens da janela global são todas de A', async () => {
    montarCenario();

    const conversas = await RealtimeService.fetchInitialConversations();

    // o cenário é o do defeito: a janela global (1000) só alcança as mensagens de A
    expect(limitePedidoEmMessages).toEqual([LIMITE_GLOBAL]);
    expect(AS_1000_DE_A.length + 1).toBe(1001); // 1001 mensagens de dois contatos no banco

    const b = conversaDe(conversas, CONTATO_B.id);
    expect(b, 'a conversa de B precisa existir na lista').toBeDefined();
    expect(b?.lastMessage?.content, 'B não pode ficar com histórico vazio').toBe(ULTIMA_DE_B.content);
    expect(b?.lastMessage?.created_at).toBe(ULTIMA_DE_B.created_at);
    expect(b?.unreadCount, 'B não pode ficar com zero não lidas').toBe(1);
    expect(b?.messages.length, 'a conversa carrega a última mensagem do contato').toBe(1);
  });

  it('só pergunta o agregado dos contatos ausentes da amostra, em blocos, e não regride quem está nela', async () => {
    montarCenario();

    const conversas = await RealtimeService.fetchInitialConversations();

    // nada de pedir agregado de 500 contatos: só o contato sem mensagem na janela
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_inbox_contact_summaries', { p_contact_ids: [CONTATO_B.id] });

    const a = conversaDe(conversas, CONTATO_A.id);
    expect(a?.unreadCount, 'A continua com o valor derivado da própria amostra').toBe(3);
    expect(a?.lastMessage?.content).toBe('A 0');
  });

  it('amostra NÃO truncada (menos de 1000 mensagens): não consulta o agregado nenhuma vez', async () => {
    // Só há histórico fora da janela quando a janela enche. Com 3 mensagens a
    // amostra é o histórico inteiro: nem o contato B (sem mensagem na amostra)
    // justifica a RPC, porque nada ficou de fora dela.
    montarCenario({ mensagens: AS_1000_DE_A.slice(0, 3) });

    const conversas = await RealtimeService.fetchInitialConversations();

    expect(limitePedidoEmMessages).toEqual([LIMITE_GLOBAL]);
    expect(rpc, 'amostra curta não pode disparar a RPC do agregado').not.toHaveBeenCalled();
    expect(conversaDe(conversas, CONTATO_A.id)?.lastMessage?.content).toBe('A 0');
    expect(conversaDe(conversas, CONTATO_B.id)?.lastMessage).toBeNull();
  });

  it('fronteira: 999 mensagens (abaixo do teto) também não consultam o agregado', async () => {
    montarCenario({ mensagens: AS_1000_DE_A.slice(0, 999) });

    await RealtimeService.fetchInitialConversations();

    expect(rpc).not.toHaveBeenCalled();
  });

  it('não infla a inbox: contato sem nenhuma mensagem segue vazio', async () => {
    montarCenario({ resumos: [] });

    const conversas = await RealtimeService.fetchInitialConversations();

    const b = conversaDe(conversas, CONTATO_B.id);
    expect(b?.lastMessage).toBeNull();
    expect(b?.unreadCount).toBe(0);
  });

  it('quebra a consulta do agregado em blocos de 200 contatos', async () => {
    const contatos = Array.from({ length: 205 }, (_, i) => ({
      ...CONTATO_B,
      id: `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`,
    }));
    montarCenario({ contatos, mensagens: AS_1000_DE_A, resumos: [] });

    await RealtimeService.fetchInitialConversations();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect((rpc.mock.calls[0][1] as { p_contact_ids: string[] }).p_contact_ids).toHaveLength(200);
    expect((rpc.mock.calls[1][1] as { p_contact_ids: string[] }).p_contact_ids).toHaveLength(5);
  });

  it('degradação: erro no agregado não derruba a carga da inbox', async () => {
    montarCenario({ resumoErro: { message: 'function public.get_inbox_contact_summaries(uuid[]) does not exist' } });

    const conversas = await RealtimeService.fetchInitialConversations();

    expect(conversaDe(conversas, CONTATO_A.id)?.lastMessage?.content).toBe('A 0');
    expect(conversaDe(conversas, CONTATO_B.id)?.lastMessage).toBeNull();
  });

  it('degradação: exceção no agregado (RPC ausente no ambiente) também não derruba a inbox', async () => {
    montarCenario({ resumoLanca: true });

    const conversas = await RealtimeService.fetchInitialConversations();

    expect(conversaDe(conversas, CONTATO_A.id)?.lastMessage?.content).toBe('A 0');
    expect(conversaDe(conversas, CONTATO_B.id)?.lastMessage).toBeNull();
  });
});
