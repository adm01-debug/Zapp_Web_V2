/**
 * Costura de tela da reconexão do Gmail e da busca ampliada (PE-06 / PE-09).
 *
 * Os testes desta pasta dublam UM dos lados da costura: a faixa de reconexão
 * (`EmailChatInbox.reconectar.test.tsx`) e os estados da busca
 * (`EmailChatInbox.buscaEstados.test.tsx`) dublam `useGmail`; o contrato da
 * consulta (`useGmail.threadListQuery.test.tsx`) e o estado do hook
 * (`useGmail.syncStatus.test.tsx`) exercitam o hook real, mas sem a tela.
 *
 * Este arquivo fecha a costura: monta o `EmailChatInbox` REAL com o `useGmail`
 * REAL e dubla só a rede (`supabase`, `callGmailFunction`). Assim prova a
 * corrente inteira que nenhum teste dos pais cobria:
 *
 *  1. conta ativa com `sync_status='reauth_required'` -> faixa + Reconectar
 *     abre a autorização do Google (a mesma conta que a tela mostra);
 *  2. a faixa é da conta ATIVA, não de qualquer conta da lista;
 *  3. buscar leva o termo à RPC `search_email_threads` na conta ativa e o que
 *     casou só no corpo/anexo entra na consulta da lista (escopo da conta);
 *  4. erro da busca ampliada chega à tela como falha da busca.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callGmailFunctionMock, assignMock } = vi.hoisted(() => ({
  callGmailFunctionMock: vi.fn(),
  assignMock: vi.fn(),
}));

vi.mock('@/hooks/gmail/gmailApi', () => ({ callGmailFunction: callGmailFunctionMock }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-xyz'),
  storeGmailOAuthReturnContext: vi.fn(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ RESERVED_HASHES: new Set(['main-content']) }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({
  useEmailThreadForContact: () => ({ status: 'none', threadId: null }),
}));
vi.mock('../EmailThreadList', () => ({ EmailThreadList: () => <div data-testid="thread-list" /> }));
vi.mock('../EmailChatThread', () => ({ EmailChatThread: () => <div data-testid="thread" /> }));
vi.mock('../EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: () => <div data-testid="composer" /> }));

import { supabase } from '@/integrations/supabase/client';
import { EmailChatInbox } from '../EmailChatInbox';
import type { EmailThread } from '@/hooks/integrations/useGmail';

const SEARCH_LABEL = 'Busca global do Email';

// jsdom não navega: o `location` real serve só de base para o duble observável
// (o `history.replaceState` do app exige a MESMA origem do documento).
const HREF_REAL = window.location.href;
const ORIGEM_REAL = new URL(HREF_REAL).origin;

type Conta = {
  id: string; email_address: string; is_active: boolean;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error' | 'reauth_required';
  last_sync_at: string | null; last_error: string | null; created_at: string;
};

function conta(id: string, email: string, sync_status: Conta['sync_status']): Conta {
  return { id, email_address: email, is_active: true, sync_status, last_sync_at: null, last_error: null, created_at: '2024-01-01T00:00:00Z' };
}

const CONTA_REAUTH = conta('account-1', 'admin@example.com', 'reauth_required');
const CONTA_SAUDAVEL = conta('account-2', 'financeiro@example.com', 'synced');

function makeThread(id: string): EmailThread {
  return {
    id, gmail_account_id: 'account-1', gmail_thread_id: `g-${id}`, contact_id: null, subject: `Assunto ${id}`,
    snippet: 'trecho', label_ids: ['INBOX'], message_count: 1, is_unread: true, is_starred: false,
    is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
    last_from_address: 'cliente@example.com', assigned_to: null, status: 'open', priority: 'medium',
    tags: [], created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
  };
}

interface RpcCall { fn: string; args: Record<string, unknown> }
interface Records { list: string[]; other: string[]; rpc: RpcCall[] }

const records: Records = { list: [], other: [], rpc: [] };

/**
 * Corrente falsa que registra cada chamada e devolve as linhas da lista só
 * quando a consulta da tela (`email_threads`) é montada. As demais tabelas
 * (anexos, rótulos) devolvem vazio — não é o alvo destes testes.
 */
function makeChain(table: string, rows: unknown[]) {
  const bucket = table === 'email_threads' ? records.list : records.other;
  const payload = () => ({ data: rows, error: null, count: rows.length });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    select: (columns: string, options?: unknown) => {
      const head = Boolean(options && (options as { head?: boolean }).head);
      bucket.push(head ? `count-select(${columns})` : `select(${columns})`);
      return chain;
    },
    eq: (column: string, value: unknown) => { bucket.push(`eq(${column},${JSON.stringify(value)})`); return chain; },
    contains: (column: string, value: unknown) => { bucket.push(`contains(${column},${JSON.stringify(value)})`); return chain; },
    gte: (column: string, value: unknown) => { bucket.push(`gte(${column},${JSON.stringify(value)})`); return chain; },
    or: (filters: string) => { bucket.push(`or(${filters})`); return chain; },
    order: () => chain,
    in: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length }),
    limit: () => Promise.resolve(payload()),
  };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(payload()).then(resolve);
  return chain;
}

interface SetupOptions {
  accounts?: Conta[];
  threads?: EmailThread[];
  searchMatches?: Array<{ thread_id: string; last_message_at: string }>;
  rpcError?: Error;
}

function setup(options: SetupOptions = {}) {
  records.list.length = 0;
  records.other.length = 0;
  records.rpc.length = 0;

  callGmailFunctionMock.mockImplementation(async (_fn: string, body: Record<string, unknown>) => {
    if (body?.action === 'list-accounts') return { accounts: options.accounts ?? [] };
    if (body?.action === 'get-auth-url') return { url: 'https://accounts.google.com/o/oauth2/auth?x=1' };
    return {};
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.from as any).mockImplementation((table: string) =>
    makeChain(table, table === 'email_threads' ? (options.threads ?? []) : []));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any).mockImplementation((fn: string, args: Record<string, unknown> = {}) => {
    records.rpc.push({ fn, args });
    if (options.rpcError) return Promise.resolve({ data: null, error: options.rpcError });
    const limit = (args.p_limit as number | undefined) ?? Number.MAX_SAFE_INTEGER;
    const after = args.p_after as string | undefined;
    const matches = (options.searchMatches ?? []).filter(m => !after || m.last_message_at < after).slice(0, limit);
    return Promise.resolve({ data: matches, error: null });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.channel as any).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() });
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

async function renderWorkspace(options: SetupOptions) {
  setup(options);
  render(<EmailChatInbox />, { wrapper: makeWrapper() });
  await screen.findByTestId('email-header');
}

function digitaBusca(termo: string) {
  fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: termo } });
}

// O gatilho do Select (Radix) chama estas APIs no pointerdown; o jsdom não as
// implementa. Mesmo cinto do EmailChatInbox.reconectar.test.tsx.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

describe('EmailChatInbox + useGmail reais — reconexão e busca ampliada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom não navega: troca o location por um duble observável que ainda
    // responde href/search (o hook lê ?view= para o retorno do OAuth).
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        href: HREF_REAL,
        search: '?view=email-chat',
        hash: '',
        origin: ORIGEM_REAL,
        pathname: '/',
        assign: assignMock,
        replace: vi.fn(),
        toString: () => HREF_REAL,
      },
    });
  });

  it('conta ativa em reauth_required acende a faixa e o Reconectar abre a autorização da mesma conta', async () => {
    await renderWorkspace({ accounts: [CONTA_REAUTH, CONTA_SAUDAVEL] });

    // needsReconnect sai do sync_status REAL da conta ativa (sem dublar o hook).
    const faixa = await screen.findByTestId('gmail-sync-banner');
    expect(faixa).toHaveAttribute('role', 'alert');
    expect(faixa).toHaveTextContent('Sua conta Gmail precisa ser reconectada');
    // A faixa pertence à conta que o cabeçalho mostra como ativa.
    expect(screen.getByRole('combobox', { name: 'Conta de email ativa' })).toHaveTextContent('admin@example.com');

    fireEvent.click(within(faixa).getByRole('button', { name: 'Reconectar' }));

    // Reconectar dispara o fluxo OAuth da MESMA conta (get-auth-url) e desvia a tela.
    await waitFor(() => expect(callGmailFunctionMock).toHaveBeenCalledWith('gmail-oauth', { action: 'get-auth-url', state: 'state-xyz' }));
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it('a faixa é da conta ATIVA: uma terceira conta exigindo reconexão não acende o aviso', async () => {
    // A conta ativa (primeira is_active) está saudável; a reauth_required é outra.
    await renderWorkspace({ accounts: [CONTA_SAUDAVEL, CONTA_REAUTH] });

    expect(screen.getByRole('combobox', { name: 'Conta de email ativa' })).toHaveTextContent('financeiro@example.com');
    expect(screen.queryByTestId('gmail-sync-banner')).not.toBeInTheDocument();
  });

  it('busca leva o termo à RPC na conta ativa e soma o que casou só no corpo/anexo', async () => {
    const casadoNoCorpo = makeThread('thread-body');
    await renderWorkspace({
      accounts: [CONTA_REAUTH],
      threads: [casadoNoCorpo],
      searchMatches: [{ thread_id: casadoNoCorpo.id, last_message_at: casadoNoCorpo.last_message_at }],
    });

    digitaBusca('fatura');
    await waitFor(() => expect(records.rpc.length).toBeGreaterThan(0));

    // A busca no corpo/anexo vai à RPC com o escopo da conta ativa.
    expect(records.rpc[0].fn).toBe('search_email_threads');
    expect(records.rpc[0].args).toMatchObject({ p_account: 'account-1', p_q: 'fatura' });

    // O que a RPC achou (corpo/anexo) entra no OR da consulta da lista, que
    // continua presa à mesma conta.
    const or = records.list.find(entry => entry.startsWith('or(')) ?? '';
    expect(or).toContain('id.in.(thread-body)');
    expect(records.list).toContain('eq(gmail_account_id,"account-1")');
  });

  it('erro da busca ampliada chega à tela como falha da busca', async () => {
    await renderWorkspace({ accounts: [CONTA_REAUTH], rpcError: new Error('offline') });

    digitaBusca('fatura');

    expect(await screen.findByTestId('busca-global-erro')).toHaveTextContent('Você está offline');
    expect(screen.queryByTestId('busca-global-vazia')).not.toBeInTheDocument();
  });
});
