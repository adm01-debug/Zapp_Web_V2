/**
 * PD-51 / cartão t_d0f7873a — as leituras da Inbox liam `contacts` sem
 * `deleted_at`, então o contato soft-deleted voltava para a lista:
 * `fetchInitialConversations` (semente da lista, 500 contatos) e
 * `fetchContactsByIds` (contatos que só apareciam na amostra de mensagens)
 * não filtravam a coluna. A política de SELECT (RLS) já esconde o excluído do
 * não-admin, mas o filtro explícito é a defesa pedida no cartão e vale para
 * TODOS os papéis (admin/supervisor continuam vendo o excluído na lixeira e a
 * Inbox não pode servir de porta de entrada para ele).
 *
 * O mock abaixo se comporta como o PostgREST: aplica de verdade `is`, `in`,
 * `not`, `eq` e `limit` sobre as linhas da tabela. Assim o teste prova o
 * comportamento (o excluído não aparece na lista), não só que o filtro foi
 * escrito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

import { RealtimeService } from '../realtime.service';

// --- tabela falsa que aplica os filtros da cadeia ---------------------------
interface Filtro {
  op: string;
  args: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tabela(linhas: Record<string, any>[], erros: { error?: unknown } = {}) {
  const filtros: Filtro[] = [];
  let limite: number | undefined;

  const aplicar = () => {
    let out = [...linhas];
    for (const f of filtros) {
      if (f.op === 'is') out = out.filter((r) => (r[f.args[0] as string] ?? null) === f.args[1]);
      else if (f.op === 'in') out = out.filter((r) => (f.args[1] as unknown[]).includes(r[f.args[0] as string]));
      else if (f.op === 'eq') out = out.filter((r) => r[f.args[0] as string] === f.args[1]);
      else if (f.op === 'not' && f.args[1] === 'is' && f.args[2] === null) {
        out = out.filter((r) => (r[f.args[0] as string] ?? null) !== null);
      }
    }
    return limite === undefined ? out : out.slice(0, limite);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: aplicar(), error: erros.error ?? null }).then(ok, err);
  for (const metodo of ['select', 'eq', 'neq', 'or', 'not', 'is', 'in', 'order', 'limit', 'range']) {
    b[metodo] = (...args: unknown[]) => {
      if (metodo === 'limit') limite = args[0] as number;
      else if (metodo !== 'select' && metodo !== 'order') filtros.push({ op: metodo, args });
      return b;
    };
  }
  return b;
}

// --- fixture -----------------------------------------------------------------
const VIVO = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Vivo',
  phone: '5511999990001',
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-10-05T09:00:00.000Z',
  conversation_status: 'open',
  assigned_to: null,
  tags: [],
  deleted_at: null,
};

const EXCLUIDO = {
  ...VIVO,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  name: 'Excluído',
  phone: '5511999990002',
  updated_at: '2026-10-05T10:00:00.000Z',
  deleted_at: '2026-10-05T11:00:00.000Z',
};

const MENSAGEM_VIVO = {
  id: 'm-vivo',
  contact_id: VIVO.id,
  sender: 'contact',
  content: 'oi',
  message_type: 'text',
  is_read: false,
  created_at: '2026-10-05T08:00:00.000Z',
  external_id: 'wamid.vivo.1',
};

const MENSAGEM_EXCLUIDO = {
  ...MENSAGEM_VIVO,
  id: 'm-excluido',
  contact_id: EXCLUIDO.id,
  created_at: '2026-10-05T09:30:00.000Z',
  external_id: 'wamid.excluido.1',
};

function montar(opcoes: { contatos?: Record<string, unknown>[]; mensagens?: Record<string, unknown>[] } = {}) {
  from.mockImplementation((tabelaNome: string) => {
    if (tabelaNome === 'messages') return tabela((opcoes.mensagens ?? [MENSAGEM_VIVO]) as never[]);
    return tabela((opcoes.contatos ?? [VIVO, EXCLUIDO]) as never[]);
  });
  rpc.mockResolvedValue({ data: [], error: null });
}

describe('RealtimeService — a Inbox não serve contato excluído (PD-51)', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('fetchInitialConversations: o excluído devolvido pelo banco não entra na lista', async () => {
    montar();

    const conversas = await RealtimeService.fetchInitialConversations();
    const ids = conversas.map((c) => c.contact.id);

    expect(ids).toContain(VIVO.id);
    expect(ids, 'contato com deleted_at não pode voltar pela semente da Inbox').not.toContain(EXCLUIDO.id);
  });

  it('fetchInitialConversations: mensagem do excluído não ressuscita a conversa', async () => {
    montar({ mensagens: [MENSAGEM_VIVO, MENSAGEM_EXCLUIDO] });

    const conversas = await RealtimeService.fetchInitialConversations();

    expect(conversas.map((c) => c.contact.id)).toEqual([VIVO.id]);
  });

  it('fetchContactsByIds: o excluído pedido pelos ids das mensagens não é devolvido', async () => {
    montar({ contatos: [EXCLUIDO] });

    const contatos = await RealtimeService.fetchContactsByIds([EXCLUIDO.id]);

    expect(contatos).toEqual([]);
  });

  it('contraponta: o contato vivo do caminho normal continua sendo devolvido', async () => {
    montar({ contatos: [VIVO, EXCLUIDO] });

    const contatos = await RealtimeService.fetchContactsByIds([VIVO.id, EXCLUIDO.id]);

    expect(contatos.map((c) => c.id)).toEqual([VIVO.id]);
  });
});
