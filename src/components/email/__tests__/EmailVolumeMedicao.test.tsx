/**
 * EN-088 (achado OTH-014) — medição de volume, memória, consultas, iframes,
 * listeners e blobs do módulo Email.
 *
 * A auditoria (docs/reconciliation/FINDINGS.json, OTH-014) registrou que o
 * módulo tem fixtures de 1.000 threads e extremos de anexos, mas NÃO tinha as
 * medições exigidas por EN-088 — consultas, memória, iframes, listeners e blobs
 * com orçamento antes/depois. Este arquivo é a medição: cada caso imprime uma
 * linha `EN088 | ...` e trava o orçamento medido. Os números alimentam
 * docs/design/EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md.
 *
 * A medição de CONSULTAS executa o `useGmail` real (via `renderHook`) com o
 * cliente Supabase mockado e deriva o total das chamadas observadas na cadeia
 * real (`from`/`select`/`range`/`in`/`count: exact`) — nunca de uma constante
 * `+2` nem chamando `collectEmailPages`/`chunkEmailIds` por fora. Um N+1 real no
 * hook faz a contagem crescer por thread e o orçamento acusa (ver a prova de
 * mutação no doc).
 *
 * O que NÃO é medido aqui (dito com todas as letras): heap JS do navegador.
 * jsdom não expõe `performance.memory`/`measureUserAgentSpecificMemory`, e medir
 * isso de verdade exige browser real (Playwright/DevTools), fora do escopo deste
 * cartão. No lugar de um número ruidoso, fica medido o custo que jsdom
 * representa fielmente: árvore DOM montada, material do corpus e ciclo de vida
 * de iframes, object URLs e listeners.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, waitFor, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailThreadList } from '../EmailThreadList';
import { EmailFullViewDialog } from '../EmailFullViewDialog';
import { EmailAttachmentPreviewDialog } from '../EmailAttachmentPreviewDialog';
import type { EmailAttachment, EmailThread, GmailAccount } from '@/hooks/integrations/useGmail';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => {
      if (prop === 'button' || prop === 'div') return ({ children, ...props }: Record<string, unknown>) => <button type="button" {...props}>{children as React.ReactNode}</button>;
      return ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>;
    },
  }),
}));

/**
 * Cliente Supabase falso que REGISTRA cada round-trip. Cada consulta é uma
 * cadeia fluente terminada em `await`; o registro guarda tabela, se a consulta
 * é `count: exact`, os limites do `range` e o tamanho do lote do `in`. O total
 * de consultas sai desse registro — nada é somado à mão.
 */
const sb = vi.hoisted(() => {
  type Registro = {
    tabela: string;
    countExact: boolean;
    /** `head: true` = contagem de cabeçalho (sem linhas); a lista também usa count: exact. */
    head: boolean;
    range: [number, number] | null;
    inTamanho: number | null;
    eqUnread: boolean;
  };
  const estado = {
    registros: [] as Registro[],
    corpus: [] as Array<{ id: string }>,
    total: 0,
    unread: 0,
  };
  const responder = (registro: Registro) => {
    if (registro.tabela === 'email_threads' && registro.head) {
      return { data: null, error: null, count: registro.eqUnread ? estado.unread : estado.total };
    }
    if (registro.tabela === 'email_threads' && registro.range) {
      const [from, to] = registro.range;
      return { data: estado.corpus.slice(from, to + 1), error: null, count: registro.countExact ? estado.total : null };
    }
    return { data: [], error: null };
  };
  type Cadeia = {
    select: (_colunas: string, opcoes?: { count?: string; head?: boolean }) => Cadeia;
    eq: (coluna: string, valor?: unknown) => Cadeia;
    order: () => Cadeia;
    limit: () => Cadeia;
    range: (from: number, to: number) => Cadeia;
    in: (_coluna: string, ids: unknown[]) => Cadeia;
    maybeSingle: () => Cadeia;
    then: (resolve: (valor: unknown) => unknown, reject?: (erro: unknown) => unknown) => Promise<unknown>;
  };
  const criarCadeia = (tabela: string) => {
    const registro: Registro = { tabela, countExact: false, head: false, range: null, inTamanho: null, eqUnread: false };
    const cadeia: Cadeia = {
      select: (_colunas: string, opcoes?: { count?: string; head?: boolean }) => {
        if (opcoes?.count === 'exact') registro.countExact = true;
        if (opcoes?.head) registro.head = true;
        return cadeia;
      },
      eq: (coluna: string, valor?: unknown) => {
        if (coluna === 'is_unread' && valor === true) registro.eqUnread = true;
        return cadeia;
      },
      order: () => cadeia,
      limit: () => cadeia,
      range: (from: number, to: number) => { registro.range = [from, to]; return cadeia; },
      in: (_coluna: string, ids: unknown[]) => { registro.inTamanho = ids.length; return cadeia; },
      maybeSingle: () => cadeia,
      then: (resolve: (valor: unknown) => unknown, reject?: (erro: unknown) => unknown) => {
        estado.registros.push(registro);
        return Promise.resolve(responder(registro)).then(resolve, reject);
      },
    };
    return cadeia;
  };
  const canalRealtime: { on: () => unknown; subscribe: () => unknown } = { on: () => canalRealtime, subscribe: () => canalRealtime };
  const supabase = {
    from: (tabela: string) => criarCadeia(tabela),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => canalRealtime,
    removeChannel: () => {},
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async () => ({ data: null, error: new Error('não usado no medidor') }) },
  };
  return { estado, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: sb.supabase }));
vi.mock('@/hooks/gmail/gmailApi', () => ({ callGmailFunction: vi.fn() }));

import { useGmail, EMAIL_THREAD_PAGE_SIZE } from '@/hooks/integrations/useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS } from '@/lib/emailThreadQuery';
import { callGmailFunction } from '@/hooks/gmail/gmailApi';

/** Corpus de volume do EN-088: N threads sintéticas. */
function corpus(total: number): EmailThread[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `bulk-${index}`, gmail_account_id: 'a1', gmail_thread_id: `g-${index}`, contact_id: null,
    subject: `Assunto ${index}`, snippet: 'Trecho de pré-visualização '.repeat(6),
    label_ids: [], message_count: 1, is_unread: false, is_starred: false,
    is_important: false, last_message_at: '2026-10-02T12:00:00Z',
    last_from_name: `Carga ${index}`, last_from_address: `carga${index}@exemplo.com`,
    assigned_to: null, status: 'open', priority: 'medium', tags: [],
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T12:00:00Z',
  } as EmailThread));
}

const CONTA: GmailAccount = {
  id: 'a1', user_id: 'u1', email_address: 'conta@promobrindes.com.br', is_active: true,
  sync_status: 'synced', last_sync_at: null, last_error: null, created_at: '2026-10-01T10:00:00Z',
};

const baseProps = {
  threadsLoading: false, labels: [], unreadCount: 0, selectedThreadId: null,
  activeAccountEmail: 'conta@promobrindes.com.br',
  page: 1, pageCount: 1,
  filters: EMAIL_THREAD_DEFAULT_FILTERS,
  onFiltersChange: () => {}, onSearchChange: () => {}, onResetFilters: () => {}, onPageChange: () => {},
  onSelectThread: () => {}, onNewEmail: () => {}, onSync: () => {}, isSyncing: false,
};

/** Linhas de thread realmente montadas no DOM (cada item expõe um `line-clamp-2`). */
function linhasMontadas(): number {
  return document.querySelectorAll('.line-clamp-2').length;
}

/**
 * Registra uma linha `EN088 | …` na saída crua. Escreve direto no stdout do
 * processo: o reporter `default` do Vitest 4 engole o `console.log` dos testes
 * que passam, e a medição precisa da saída visível no comando de reprodução.
 */
function registrar(linha: string) {
  process.stdout.write(`${linha}\n`);
}

/**
 * Mede os round-trips executando o `useGmail` REAL com o Supabase mockado.
 * O total sai do registro de chamadas observadas na cadeia de threads
 * (`email_threads` + `email_messages`): páginas (`range`), lotes de anexo (`in`)
 * e os contadores `count: exact`. Nada é somado à mão.
 */
async function medirConsultasReais(total: number) {
  const threads = corpus(total);
  sb.estado.registros.length = 0;
  sb.estado.corpus = threads.map(thread => ({ id: thread.id }));
  sb.estado.total = 5000;
  sb.estado.unread = 123;
  vi.mocked(callGmailFunction).mockImplementation(async (_fn: string, opts: Record<string, unknown>) => {
    if ((opts as { action?: string }).action === 'list-accounts') return { accounts: [CONTA] };
    return {};
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  const { result, unmount } = renderHook(() => useGmail(), { wrapper });
  await waitFor(() => {
    // OTH-005: a consulta padrão traz UMA página do servidor; o total continua
    // vindo da contagem exata do mesmo filtro.
    expect(result.current.threads).toHaveLength(Math.min(total, EMAIL_THREAD_PAGE_SIZE));
    expect(result.current.threadsTotalCount).toBe(5000);
  });

  const registros = [...sb.estado.registros];
  const carregadas = result.current.threads.length;
  unmount();
  queryClient.clear();

  const daCaixa = registros.filter(r => r.tabela === 'email_threads' || r.tabela === 'email_messages');
  return {
    consultas: daCaixa.length,
    paginas: daCaixa.filter(r => r.tabela === 'email_threads' && r.range).length,
    lotes: daCaixa.filter(r => r.tabela === 'email_messages' && r.inTamanho !== null).length,
    contadores: daCaixa.filter(r => r.tabela === 'email_threads' && r.head).length,
    carregadas,
  };
}

/** Orçamento de páginas por volume: ceil(N/página) + 1 sondagem de fim. */
function orcamentoPaginas(total: number): number {
  return Math.ceil(total / 1000) + 1;
}

/** Orçamento de lotes de anexo por volume: ceil(N/lote). */
function orcamentoLotes(total: number): number {
  return Math.ceil(total / 500);
}

// Restauração segura dos globais instrumentados: `afterEach` roda mesmo quando
// uma asserção falha, então nenhum teste deixa `addEventListener`,
// `removeEventListener`, `createObjectURL` ou `revokeObjectURL` instrumentado.
const ORIGINAIS = {
  addEventListenerJanela: window.addEventListener,
  removeEventListenerJanela: window.removeEventListener,
  addEventListenerDoc: document.addEventListener,
  removeEventListenerDoc: document.removeEventListener,
  createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
};

function restaurarGlobal(alvo: object, chave: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(alvo, chave, descriptor);
  else delete (alvo as Record<string, unknown>)[chave];
}

describe('EN-088 — medição de volume, memória, consultas, iframes, listeners e blobs', () => {
  beforeEach(() => window.history.replaceState({}, '', '/?view=email-chat'));
  afterEach(() => {
    cleanup();
    window.addEventListener = ORIGINAIS.addEventListenerJanela;
    window.removeEventListener = ORIGINAIS.removeEventListenerJanela;
    document.addEventListener = ORIGINAIS.addEventListenerDoc;
    document.removeEventListener = ORIGINAIS.removeEventListenerDoc;
    restaurarGlobal(URL, 'createObjectURL', ORIGINAIS.createObjectURL);
    restaurarGlobal(URL, 'revokeObjectURL', ORIGINAIS.revokeObjectURL);
  });

  it('consultas: o número de round-trips não cresce com o tamanho da caixa (sem N+1)', async () => {
    const pequeno = await medirConsultasReais(20);
    const grande = await medirConsultasReais(1000);
    registrar(
      `EN088 | consultas corpus=20  paginas=${pequeno.paginas} lotes=${pequeno.lotes} contadores=${pequeno.contadores} consultas=${pequeno.consultas} carregadas=${pequeno.carregadas}`,
    );
    registrar(
      `EN088 | consultas corpus=1000 paginas=${grande.paginas} lotes=${grande.lotes} contadores=${grande.contadores} consultas=${grande.consultas} carregadas=${grande.carregadas}`,
    );

    expect(pequeno.carregadas).toBe(EMAIL_THREAD_PAGE_SIZE);
    expect(grande.carregadas).toBe(EMAIL_THREAD_PAGE_SIZE);
    // O total medido é, por construção, a decomposição das chamadas OBSERVADAS no
    // cliente mockado: páginas (`range`) + lotes de anexo (`in`) + contadores
    // `count: exact`. Nada é somado à mão — se o hook ganhar uma consulta por
    // thread, um dos termos cresce e o orçamento abaixo acusa.
    expect(pequeno.consultas).toBe(pequeno.paginas + pequeno.lotes + pequeno.contadores);
    expect(grande.consultas).toBe(grande.paginas + grande.lotes + grande.contadores);
    // Orçamento por volume: o custo é O(páginas + lotes + contadores), nunca O(threads).
    expect(pequeno.paginas).toBeLessThanOrEqual(orcamentoPaginas(20));
    expect(grande.paginas).toBeLessThanOrEqual(orcamentoPaginas(1000));
    expect(pequeno.lotes).toBeLessThanOrEqual(orcamentoLotes(20));
    expect(grande.lotes).toBeLessThanOrEqual(orcamentoLotes(1000));
    // O contador exato separado é só o de não-lidos; o total vem da consulta paginada.
    expect(pequeno.contadores).toBe(1);
    expect(grande.contadores).toBe(1);
    // Nenhum corpus chega perto de "1 consulta por thread".
    expect(pequeno.consultas).toBeLessThan(20);
    expect(grande.consultas).toBeLessThan(1000);
  });

  it('memória: 1.000 threads retêm só uma página de 20 linhas montadas', () => {
    const vinte = corpus(20);
    const mil = corpus(1000);
    const bytesCorpus = new TextEncoder().encode(JSON.stringify(mil)).length;
    registrar(`EN088 | memoria corpus=1000 material_bytes=${bytesCorpus}`);

    // OTH-005: a lista é só apresentação — recebe a página que o servidor mandou
    // (20 linhas), não o corpus inteiro; o recorte em memória deixou de existir.
    const pequeno = render(<EmailThreadList threads={vinte.slice(0, EMAIL_THREAD_PAGE_SIZE)} totalCount={vinte.length} {...baseProps} />);
    const nosPequeno = pequeno.container.querySelectorAll('*').length;
    const linhasPequeno = linhasMontadas();
    pequeno.unmount();

    const grande = render(<EmailThreadList threads={mil.slice(0, EMAIL_THREAD_PAGE_SIZE)} totalCount={mil.length} {...baseProps} />);
    const nosGrande = grande.container.querySelectorAll('*').length;
    const linhasGrande = linhasMontadas();
    registrar(`EN088 | memoria dom corpus=20   linhas=${linhasPequeno} nos=${nosPequeno}`);
    registrar(`EN088 | memoria dom corpus=1000 linhas=${linhasGrande} nos=${nosGrande}`);

    expect(screen.getByText('Carga 0')).toBeInTheDocument();
    expect(screen.queryByText('Carga 20')).not.toBeInTheDocument();
    // Orçamento: a página local (20) não cresce com o corpus; a árvore do corpus
    // de 1.000 não pode ser maior que a de 20 além das linhas da própria página.
    expect(linhasGrande).toBe(20);
    expect(linhasGrande).toBe(linhasPequeno);
    expect(nosGrande).toBeLessThanOrEqual(nosPequeno + 20);
    // Orçamento do material retido: 1.000 threads cabem em < 1 MiB serializadas.
    expect(bytesCorpus).toBeLessThan(1024 * 1024);
  });

  it('iframes: no máximo 1 por leitura/prévia, e zero com o conteúdo fechado', () => {
    const view = render(<EmailFullViewDialog open={false} onOpenChange={vi.fn()} sanitizedHtml="<p>x</p>" />);
    const fechado = document.querySelectorAll('iframe').length;
    view.rerender(<EmailFullViewDialog open onOpenChange={vi.fn()} sanitizedHtml="<p>x</p>" />);
    const aberto = document.querySelectorAll('iframe').length;
    view.unmount();
    registrar(`EN088 | iframes leitura fechado=${fechado} aberto=${aberto} desmontado=${document.querySelectorAll('iframe').length}`);

    expect(fechado).toBe(0);
    expect(aberto).toBe(1);
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('blobs: 40 prévias em sequência mantêm ≤ 1 object URL vivo e zeram no fim', () => {
    let criados = 0;
    let revogados = 0;
    let vivos = 0;
    let pico = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => { criados += 1; vivos += 1; pico = Math.max(pico, vivos); return `blob:preview-${criados}`; }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => { revogados += 1; vivos -= 1; }),
    });

    const anexo = (index: number): EmailAttachment => ({
      id: `att-${index}`, email_message_id: 'message-1', gmail_attachment_id: `gmail-${index}`,
      filename: `anexo-${index}.pdf`, mime_type: 'application/pdf', size_bytes: 3,
    });

    const view = render(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo(0)} contentBase64="AQID" />);
    for (let index = 1; index < 40; index += 1) {
      view.rerender(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo(index)} contentBase64="AQIDBAUGBwg=" />);
    }
    const vivosComDialogo = vivos;
    view.unmount();
    registrar(`EN088 | blobs criados=${criados} revogados=${revogados} pico_vivos=${pico} antes_de_fechar=${vivosComDialogo} depois_de_fechar=${vivos}`);

    expect(criados).toBe(40);
    // Orçamento: o pico é ≤ 2 (o object URL da prévia nova nasce antes de o da
    // antiga ser revogado), nunca 40; em repouso com o diálogo aberto há 1 vivo.
    expect(pico).toBeLessThanOrEqual(2);
    expect(vivosComDialogo).toBe(1);
    expect(vivos).toBe(0);
  });

  it('listeners: abrir/fechar 40 prévias não deixa listener pendente acumulado', () => {
    // Rastreia por IDENTIDADE (listener → tipo) para não contar remoções de
    // listeners registrados fora da janela medida. O que importa é o saldo de
    // listeners que ESTE ciclo registrou: se um vazar, o mapa cresce por ciclo.
    const vivosGlobal = new Map<unknown, string>();
    const instrumentar = (alvo: Window | Document) => {
      const add = alvo.addEventListener.bind(alvo) as (type: string, listener: unknown, options?: unknown) => void;
      const remove = alvo.removeEventListener.bind(alvo) as (type: string, listener: unknown, options?: unknown) => void;
      alvo.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
        vivosGlobal.set(listener, type);
        add(type, listener, options);
      }) as unknown as typeof alvo.addEventListener;
      alvo.removeEventListener = ((type: string, listener: unknown, options?: unknown) => {
        vivosGlobal.delete(listener);
        remove(type, listener, options);
      }) as unknown as typeof alvo.removeEventListener;
    };
    instrumentar(window);
    instrumentar(document);
    // A restauração dos globais é garantida pelo `afterEach` (roda mesmo numa
    // falha de asserção) — não há restauração manual no fim deste teste.

    const anexo: EmailAttachment = {
      id: 'att-1', email_message_id: 'message-1', gmail_attachment_id: 'gmail-1',
      filename: 'anexo.pdf', mime_type: 'application/pdf', size_bytes: 3,
    };
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    let pendentesAposPrimeiro = 0;
    for (let ciclo = 0; ciclo < 40; ciclo += 1) {
      const view = render(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo} contentBase64="AQID" />);
      view.unmount();
      if (ciclo === 0) pendentesAposPrimeiro = vivosGlobal.size;
    }
    const pendentesAposUltimo = vivosGlobal.size;
    registrar(`EN088 | listeners pendentes_apos_1_ciclo=${pendentesAposPrimeiro} pendentes_apos_40_ciclos=${pendentesAposUltimo}`);

    // Orçamento: o saldo de listeners não cresce com o número de ciclos.
    expect(pendentesAposUltimo).toBe(pendentesAposPrimeiro);
  });
});
