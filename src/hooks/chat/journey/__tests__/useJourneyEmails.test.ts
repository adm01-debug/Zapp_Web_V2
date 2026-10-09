import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

/** Mesmo dublê da fonte de ligação: registra os métodos E aplica os filtros nas linhas. */
const estado = vi.hoisted(() => ({
  registros: [] as Array<{ tabela: string; metodo: string; args: unknown[] }>,
  linhas: {} as Record<string, unknown[]>,
  erro: {} as Record<string, string>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const valorDe = (linha: Record<string, unknown>, caminho: string): unknown =>
    caminho.split('.').reduce<unknown>((atual, chave) => {
      if (atual === null || atual === undefined) return undefined;
      return (atual as Record<string, unknown>)[chave];
    }, linha);

  const criarCadeia = (tabela: string) => {
    let faixa: [number, number] | null = null;
    const iguais: Array<[string, unknown]> = [];
    const maiores: Array<[string, string]> = [];
    const menores: Array<[string, string]> = [];

    const registrar = (metodo: string, args: unknown[]) => {
      estado.registros.push({ tabela, metodo, args });
    };

    const combinam = (linha: Record<string, unknown>) =>
      iguais.every(([coluna, valor]) => valorDe(linha, coluna) === valor) &&
      maiores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        return typeof atual === 'string' && atual !== '' && atual >= limite;
      }) &&
      menores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        return typeof atual === 'string' && atual !== '' && atual <= limite;
      });

    const responder = () => {
      if (estado.erro[tabela]) return { data: null, error: { message: estado.erro[tabela] } };
      const linhas = ((estado.linhas[tabela] ?? []) as Record<string, unknown>[]).filter(combinam);
      return { data: faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas, error: null };
    };

    const cadeia: Record<string, unknown> = {};
    cadeia.select = (colunas: string) => { registrar('select', [colunas]); return cadeia; };
    cadeia.eq = (coluna: string, valor: unknown) => {
      registrar('eq', [coluna, valor]);
      iguais.push([coluna, valor]);
      return cadeia;
    };
    cadeia.gte = (coluna: string, limite: string) => {
      registrar('gte', [coluna, limite]);
      maiores.push([coluna, limite]);
      return cadeia;
    };
    cadeia.lte = (coluna: string, limite: string) => {
      registrar('lte', [coluna, limite]);
      menores.push([coluna, limite]);
      return cadeia;
    };
    cadeia.order = (coluna: string, opcoes: unknown) => { registrar('order', [coluna, opcoes]); return cadeia; };
    cadeia.range = (from: number, to: number) => {
      registrar('range', [from, to]);
      faixa = [from, to];
      return Promise.resolve(responder());
    };
    cadeia.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(responder()).then(ok, falha);
    return cadeia;
  };

  return { supabase: { from: (tabela: string) => criarCadeia(tabela) } };
});

import { JOURNEY_EMAILS_PAGE_SIZE, useJourneyEmails } from '@/hooks/chat/journey/useJourneyEmails';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

const RANGE = { sinceIso: '2026-10-01T03:00:00.000Z', untilIso: '2026-10-08T02:59:59.999Z' };

function conversa(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contact_id: 'contato-1',
    last_message_at: '2026-10-05T11:00:00.000Z',
    assigned_to: 'agente-1',
    ...over,
  };
}

function linhaEmail(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mail-1',
    thread_id: 'thread-1',
    direction: 'inbound',
    subject: 'Orçamento dos brindes',
    snippet: 'Segue o valor por unidade…',
    internal_date: '2026-10-05T12:00:00.000Z',
    from_name: 'Maria Souza',
    email_threads: conversa(),
    ...over,
  };
}

const filtrosDe = (tabela: string) => estado.registros.filter((r) => r.tabela === tabela);

beforeEach(() => {
  estado.registros.length = 0;
  estado.linhas = {};
  estado.erro = {};
});

describe('useJourneyEmails — e-mails do contato no período', () => {
  it('escopa pela conversa do contato e recorta last_message_at no intervalo', async () => {
    estado.linhas.email_messages = [
      linhaEmail({ id: 'dentro' }),
      linhaEmail({ id: 'de-outro', email_threads: conversa({ contact_id: 'contato-2' }) }),
      linhaEmail({ id: 'fora-do-periodo', email_threads: conversa({ last_message_at: '2026-09-01T11:00:00.000Z' }) }),
      linhaEmail({ id: 'depois-do-periodo', email_threads: conversa({ last_message_at: '2026-10-20T11:00:00.000Z' }) }),
    ];
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const filtros = filtrosDe('email_messages');
    expect(filtros).toContainEqual({
      tabela: 'email_messages',
      metodo: 'eq',
      args: ['email_threads.contact_id', 'contato-1'],
    });
    expect(filtros).toContainEqual({
      tabela: 'email_messages',
      metodo: 'gte',
      args: ['email_threads.last_message_at', RANGE.sinceIso],
    });
    expect(filtros).toContainEqual({
      tabela: 'email_messages',
      metodo: 'lte',
      args: ['email_threads.last_message_at', RANGE.untilIso],
    });
    expect(filtros.filter((f) => f.metodo === 'order').map((f) => f.args)).toEqual([
      ['internal_date', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    // A conversa de outro contato e a conversa fora do período ficam de fora de verdade.
    expect(result.current.emails.map((e) => e.id)).toEqual(['dentro']);
  });

  it('NUNCA pede o corpo do e-mail (nem body_html, nem body_text)', async () => {
    estado.linhas.email_messages = [linhaEmail()];
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const selecao = filtrosDe('email_messages').find((f) => f.metodo === 'select');
    expect(selecao).toBeDefined();
    const colunas = String(selecao?.args[0]);
    expect(colunas).not.toContain('body_html');
    expect(colunas).not.toContain('body_text');
    expect(colunas).toContain('snippet');
    expect(colunas).toContain('email_threads!inner');
  });

  it('mapeia para RawEmail sem corpo, agrupando pela conversa e com o responsável dela', async () => {
    estado.linhas.email_messages = [
      linhaEmail({
        id: 'mail-1',
        // A linha pode trazer o corpo (o banco tem a coluna); o retorno não pode carregá-lo.
        body_html: '<p>corpo secreto</p>',
        body_text: 'corpo secreto',
      }),
      linhaEmail({
        id: 'mail-2',
        direction: 'outbound',
        thread_id: 'thread-2',
        email_threads: conversa({ assigned_to: null }),
      }),
    ];
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.emails).toHaveLength(2));

    const porId = new Map(result.current.emails.map((e) => [e.id, e]));
    expect(porId.get('mail-1')).toEqual({
      id: 'mail-1',
      threadId: 'thread-1',
      direction: 'inbound',
      subject: 'Orçamento dos brindes',
      snippet: 'Segue o valor por unidade…',
      at: '2026-10-05T12:00:00.000Z',
      fromName: 'Maria Souza',
      assignedTo: 'agente-1',
    });
    expect(porId.get('mail-2')?.threadId).toBe('thread-2');
    expect(porId.get('mail-2')?.assignedTo).toBeNull();

    for (const email of result.current.emails) {
      expect(email).not.toHaveProperty('body_html');
      expect(email).not.toHaveProperty('body_text');
      expect(email).not.toHaveProperty('bodyHtml');
      expect(email).not.toHaveProperty('bodyText');
      expect(JSON.stringify(email)).not.toContain('corpo secreto');
    }
  });

  it('pagina de 300 em 300, para na página incompleta e mantém o escopo em TODAS as páginas', async () => {
    estado.linhas.email_messages = Array.from({ length: 650 }, (_, i) => linhaEmail({ id: `mail-${i}` }));
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.emails).toHaveLength(JOURNEY_EMAILS_PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);

    await act(async () => { result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.emails).toHaveLength(600));

    await act(async () => { result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.emails).toHaveLength(650));
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    expect(filtrosDe('email_messages').filter((f) => f.metodo === 'range').map((f) => f.args)).toEqual([
      [0, 299],
      [300, 599],
      [600, 899],
    ]);
    const contar = (metodo: string) => filtrosDe('email_messages').filter((f) => f.metodo === metodo).length;
    expect(contar('eq')).toBe(3);
    expect(contar('gte')).toBe(3);
    expect(contar('lte')).toBe(3);
  });

  it('sem conta Gmail / RLS negado: zero linha e NENHUM erro (lista vazia, sem exceção)', async () => {
    estado.linhas.email_messages = [];
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.emails).toEqual([]);
    expect(result.current.isError).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha de verdade: lista vazia marcada com isError, sem exceção para a tela', async () => {
    estado.linhas.email_messages = [linhaEmail()];
    estado.erro.email_messages = 'permission denied for table email_messages';
    const { result } = renderHook(() => useJourneyEmails({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.emails).toEqual([]);
  });

  it('sem contato selecionado não consulta e entrega lista vazia', async () => {
    estado.linhas.email_messages = [linhaEmail()];
    const { result } = renderHook(() => useJourneyEmails({ contactId: null, range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.emails).toEqual([]);
    expect(estado.registros).toEqual([]);
  });
});
