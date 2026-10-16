/**
 * R2-COM-007 (item 289) — o histórico de mensagens de uma conversa não continuava
 * além do teto de linhas que a API devolve por requisição.
 *
 * A consulta da LISTA de conversas já paginava com `collectEmailPages`; a consulta
 * das mensagens e a dos anexos faziam UMA requisição sem `range`, então uma
 * conversa maior que o teto voltava truncada: as mensagens recentes sumiam, o
 * alvo de resposta caía numa mensagem antiga da amostra e anexos ficavam de fora.
 *
 * O cliente Supabase falso modela o servidor: aplica os filtros `eq`/`in` e as
 * ordens declaradas pelo cliente, respeita o `range` pedido e NUNCA devolve mais
 * que o teto por requisição — sem `range` devolve só a primeira página, que é o
 * comportamento do PostgREST. Quando o cliente não declara um desempate único
 * (`id`), os empates saem por id DESCENDENTE: a ordem que o SQL não promete. O
 * teste é sensível a isso de propósito — é a ordem adversa. Nada é somado à mão:
 * cada asserção sai do que o hook pediu e recebeu.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailAttachment, EmailMessage, GmailAccount } from '@/hooks/integrations/useGmail';

const sb = vi.hoisted(() => {
  type Linha = Record<string, unknown>;
  type Ordem = { coluna: string; ascending: boolean };
  type Registro = {
    tabela: string;
    eq: Array<[string, unknown]>;
    ordens: Ordem[];
    range: [number, number] | null;
    inValores: unknown[] | null;
    countExact: boolean;
  };
  type Resposta = { data: Linha[] | null; error: null; count?: number };

  const estado = {
    contas: [] as Linha[],
    threads: [] as Linha[],
    mensagens: [] as Linha[],
    anexos: [] as Linha[],
    registros: [] as Registro[],
    /** Teto de linhas por requisição do servidor (não é config do cliente). */
    teto: 1000,
  };

  const filtrar = (linhas: Linha[], eq: Array<[string, unknown]>) =>
    linhas.filter(linha => eq.every(([coluna, valor]) => linha[coluna] === valor));

  /** Ordena só pelas colunas declaradas pelo cliente; empate sem desempate único
   *  sai na ordem adversa (desc) porque o SQL não promete ordem em empate. */
  const ordenar = (linhas: Linha[], ordens: Ordem[]) => {
    const temDesempate = ordens.some(ordem => ordem.coluna === 'id');
    return [...linhas].sort((a, b) => {
      for (const ordem of ordens) {
        const va = String(a[ordem.coluna] ?? '');
        const vb = String(b[ordem.coluna] ?? '');
        if (va === vb) continue;
        return va < vb ? (ordem.ascending ? -1 : 1) : (ordem.ascending ? 1 : -1);
      }
      const ia = String(a.id ?? '');
      const ib = String(b.id ?? '');
      if (ia === ib) return 0;
      return ia < ib ? (temDesempate ? -1 : 1) : (temDesempate ? 1 : -1);
    });
  };

  const paginar = (linhas: Linha[], range: [number, number] | null) => {
    const [from, to] = range ?? [0, estado.teto - 1];
    return linhas.slice(from, to + 1).slice(0, estado.teto);
  };

  const responder = (registro: Registro): Resposta => {
    if (registro.tabela === 'email_threads') {
      const linhas = ordenar(filtrar(estado.threads, registro.eq), registro.ordens);
      if (registro.countExact) return { data: null, error: null, count: linhas.length };
      return { data: paginar(linhas, registro.range), error: null };
    }
    const base = registro.tabela === 'email_messages' ? estado.mensagens
      : registro.tabela === 'email_attachments' ? estado.anexos : [];
    let linhas = filtrar(base, registro.eq);
    if (registro.inValores) {
      const valores = registro.inValores;
      linhas = linhas.filter(linha => valores.includes(linha.email_message_id));
    }
    return { data: paginar(ordenar(linhas, registro.ordens), registro.range), error: null };
  };

  const canal = { on: (_evento: unknown, _filtro: unknown, _callback: unknown) => canal, subscribe: () => canal };

  const criarCadeia = (tabela: string) => {
    const registro: Registro = { tabela, eq: [], ordens: [], range: null, inValores: null, countExact: false };
    const cadeia = {
      select: (_colunas: string, opcoes?: { count?: string; head?: boolean }) => {
        if (opcoes?.count === 'exact') registro.countExact = true;
        return cadeia;
      },
      eq: (coluna: string, valor: unknown) => { registro.eq.push([coluna, valor]); return cadeia; },
      order: (coluna: string, opcoes?: { ascending?: boolean }) => {
        registro.ordens.push({ coluna, ascending: opcoes?.ascending !== false });
        return cadeia;
      },
      range: (from: number, to: number) => { registro.range = [from, to]; return cadeia; },
      in: (_coluna: string, valores: unknown[]) => { registro.inValores = valores; return cadeia; },
      limit: () => cadeia,
      maybeSingle: () => Promise.resolve({ data: (responder(registro).data ?? [])[0] ?? null, error: null }),
      then: (resolve: (valor: unknown) => unknown, reject?: (erro: unknown) => unknown) => {
        estado.registros.push(registro);
        return Promise.resolve(responder(registro)).then(resolve, reject);
      },
    };
    return cadeia;
  };

  const supabase = {
    from: (tabela: string) => criarCadeia(tabela),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => canal,
    removeChannel: () => {},
  };

  return { estado, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: sb.supabase }));
vi.mock('@/hooks/gmail/gmailApi', () => ({ callGmailFunction: vi.fn() }));

import { callGmailFunction } from '@/hooks/gmail/gmailApi';
import { useGmail } from '../useGmail';

const CONTA: GmailAccount = {
  id: 'acc1', user_id: 'u1', email_address: 'conta@promobrindes.com.br', is_active: true,
  sync_status: 'synced', last_sync_at: null, last_error: null, created_at: '2026-10-01T10:00:00Z',
};

function mensagem(id: string, threadId: string, internalDate: string, conta = 'acc1'): EmailMessage {
  return {
    id,
    thread_id: threadId,
    gmail_message_id: `gmail-${id}`,
    gmail_account_id: conta,
    from_address: 'cliente@exemplo.com',
    from_name: 'Cliente',
    to_addresses: ['conta@promobrindes.com.br'],
    cc_addresses: [],
    bcc_addresses: [],
    reply_to_address: null,
    subject: 'Assunto',
    body_text: `corpo ${id}`,
    body_html: '',
    snippet: `trecho ${id}`,
    label_ids: [],
    is_read: true,
    is_starred: false,
    has_attachments: false,
    in_reply_to: null,
    references_header: null,
    internal_date: internalDate,
    direction: 'inbound',
    created_at: internalDate,
  };
}

function anexo(id: string, emailMessageId: string): EmailAttachment {
  return {
    id, email_message_id: emailMessageId, gmail_attachment_id: `g-${id}`,
    filename: `${id}.pdf`, mime_type: 'application/pdf', size_bytes: 10,
  };
}

function preparar(mensagens: EmailMessage[], anexos: EmailAttachment[] = []) {
  sb.estado.mensagens = mensagens as unknown as Array<Record<string, unknown>>;
  sb.estado.anexos = anexos as unknown as Array<Record<string, unknown>>;
  sb.estado.threads = [];
  sb.estado.registros = [];
  vi.mocked(callGmailFunction).mockImplementation(async (_fn: string, opts: Record<string, unknown>) =>
    (opts as { action?: string }).action === 'list-accounts' ? { accounts: [CONTA] } : {});
}

function montarHook() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useGmail(), { wrapper });
}

async function abrirThread(
  result: { current: ReturnType<typeof useGmail> },
  threadId: string,
) {
  await waitFor(() => expect(result.current.activeAccount?.id).toBe('acc1'));
  act(() => result.current.setSelectedThreadId(threadId));
}

describe('R2-COM-007 — histórico de mensagens continua além do teto de resposta', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('carrega a conversa inteira quando as mensagens passam do teto de uma resposta', async () => {
    const total = 2_205;
    const mensagens = Array.from({ length: total }, (_, indice) => {
      const data = new Date(Date.UTC(2026, 0, 1, 0, 0, indice)).toISOString();
      return mensagem(`msg-${String(indice).padStart(4, '0')}`, 'thread1', data);
    });
    // Mesma thread, outra conta: a consulta é por conta e não pode devolvê-la.
    mensagens.push(mensagem('msg-intrusa', 'thread1', '2026-01-01T00:00:00.000Z', 'acc2'));
    preparar(mensagens);

    const { result } = montarHook();
    await abrirThread(result, 'thread1');
    await waitFor(() => expect(result.current.threadMessages.length).toBeGreaterThan(0));

    expect(result.current.threadMessages).toHaveLength(total);
    expect(result.current.threadMessages[0].id).toBe('msg-0000');
    expect(result.current.threadMessages[total - 1].id).toBe(`msg-${String(total - 1).padStart(4, '0')}`);
    expect(result.current.threadMessages.every(item => item.gmail_account_id === 'acc1')).toBe(true);

    // Três requisições explícitas: o histórico só "continua" quando o cliente pede
    // a próxima página em vez de aceitar o teto da primeira.
    const paginas = sb.estado.registros.filter(registro => registro.tabela === 'email_messages');
    expect(paginas.map(registro => registro.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('mantém o alvo de resposta na mensagem mais recente quando os timestamps empatam', async () => {
    const total = 1_205;
    const mesmoInstante = '2026-10-02T12:00:00.000Z';
    const mensagens = Array.from({ length: total }, (_, indice) =>
      mensagem(`msg-${String(indice).padStart(4, '0')}`, 'thread2', mesmoInstante));
    preparar(mensagens);

    const { result } = montarHook();
    await abrirThread(result, 'thread2');
    await waitFor(() => expect(result.current.threadMessages.length).toBeGreaterThan(0));

    const ids = result.current.threadMessages.map(item => item.id);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    // Ordem estável: sem o desempate único a paginação por offset não é
    // reprodutível e a resposta padrão cai numa mensagem antiga da amostra.
    expect(ids).toEqual([...ids].sort());
    expect(ids[ids.length - 1]).toBe(`msg-${String(total - 1).padStart(4, '0')}`);
  });

  it('carrega todos os anexos da conversa quando passam do teto de uma resposta', async () => {
    const totalMensagens = 500;
    const porMensagem = 3;
    const mensagens = Array.from({ length: totalMensagens }, (_, indice) => {
      const data = new Date(Date.UTC(2026, 8, 1, 0, 0, indice)).toISOString();
      return mensagem(`msg-${String(indice).padStart(4, '0')}`, 'thread3', data);
    });
    const anexos = mensagens.flatMap((item, indice) =>
      Array.from({ length: porMensagem }, (_, posicao) => anexo(`att-${String(indice).padStart(4, '0')}-${posicao}`, item.id)));
    preparar(mensagens, anexos);

    const { result } = montarHook();
    await abrirThread(result, 'thread3');
    await waitFor(() => expect(result.current.threadAttachments).toHaveLength(totalMensagens * porMensagem));

    expect(result.current.threadAttachments.map(item => item.id).sort())
      .toEqual(anexos.map(item => item.id).sort());

    const paginas = sb.estado.registros.filter(registro => registro.tabela === 'email_attachments');
    expect(paginas.map(registro => registro.range)).toEqual([[0, 999], [1000, 1999]]);
  });
});
