import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { callGmailFunction } from '@/hooks/gmail/gmailApi';
import { supabase } from '@/integrations/supabase/client';
import { createGmailOAuthState, storeGmailOAuthReturnContext } from '@/lib/gmailOAuth';


// Y29 — o useGmail lê `profiles.can_download` (useDownloadPermission); aqui a
// permissão é concedida para o teste observar o caminho de sempre.
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('@/hooks/gmail/gmailApi');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-abc'),
  storeGmailOAuthReturnContext: vi.fn(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']),
}));

import { useGmail } from '../useGmail';
import { toast } from 'sonner';

const MOCK_ACCOUNT = {
  id: 'acc1',
  email_address: 'user@example.com',
  is_active: true,
  sync_status: 'synced' as const,
  last_sync_at: null,
  last_error: null,
  created_at: '2024-01-01T00:00:00Z',
};

const MOCK_THREAD = {
  id: 'thread1',
  gmail_account_id: 'acc1',
  gmail_thread_id: 'gmail-t1',
  subject: 'Test',
  is_unread: true,
  is_starred: true,
  message_count: 1,
  tags: [],
  label_ids: [],
  snippet: '',
  contact_id: null,
  last_message_at: '2026-09-06T10:00:00Z',
  last_from_name: null,
  last_from_address: null,
  assigned_to: null,
  status: 'open' as const,
  priority: 'medium' as const,
  is_important: false,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  contact: undefined,
};

function makeFromChain(data: unknown[] = [], error: null | object = null, singleData: unknown = data[0] ?? null) {
  const end = vi.fn().mockResolvedValue({ data, error });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
    limit: end,
    range: end,
    in: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error }),
  };
  chain.order.mockReturnValue(chain);
  return chain;
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function setupDefaultMocks(accounts = [MOCK_ACCOUNT], threads = [MOCK_THREAD]) {
  vi.mocked(callGmailFunction).mockImplementation(async (fn: string, opts: Record<string, unknown>) => {
    if (fn === 'gmail-oauth' && opts.action === 'list-accounts') return { accounts };
    if (fn === 'gmail-oauth' && opts.action === 'get-auth-url') return { url: 'https://oauth.google.com/auth' };
    if (fn === 'gmail-oauth' && opts.action === 'disconnect') return {};
    if (fn === 'gmail-sync') return { synced: 5 };
    if (fn === 'gmail-send') return {};
    return {};
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(supabase.from).mockImplementation((table: string) => makeFromChain(table === 'email_threads' ? threads : []) as any);
}

describe('useGmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() } as any);
  });

  describe('accounts query', () => {
    it('retorna lista via callGmailFunction', async () => {
      setupDefaultMocks([MOCK_ACCOUNT]);
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));
      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].email_address).toBe('user@example.com');
    });

    it('fallback para supabase.rpc quando callGmailFunction lança', async () => {
      vi.mocked(callGmailFunction).mockRejectedValue(new Error('network'));
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ id: 'acc2', email_address: 'b@c.com', is_active: true, sync_status: null, last_sync_at: null, last_error: null, created_at: '' }],
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);

      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].email_address).toBe('b@c.com');
      expect(result.current.accounts[0].sync_status).toBe('pending');
    });

    it('rpc error: query falha e accounts permanece []', async () => {
      vi.mocked(callGmailFunction).mockRejectedValue(new Error('network'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('rpc fail') } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);

      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));
      expect(result.current.accounts).toEqual([]);
    });
  });

  describe('activeAccount', () => {
    it('retorna accounts[0] sem accountId', async () => {
      setupDefaultMocks();
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.activeAccount).toBeDefined());
      expect(result.current.activeAccount?.id).toBe('acc1');
    });

    it('retorna undefined quando accounts está vazio', async () => {
      setupDefaultMocks([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));
      expect(result.current.activeAccount).toBeUndefined();
    });

    it('filtra por accountId quando fornecido', async () => {
      const acc2 = { ...MOCK_ACCOUNT, id: 'acc2', email_address: 'second@example.com' };
      setupDefaultMocks([MOCK_ACCOUNT, acc2]);
      const { result } = renderHook(() => useGmail('acc2'), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.activeAccount).toBeDefined());
      expect(result.current.activeAccount?.id).toBe('acc2');
    });
  });

  describe('unreadCount e starredCount', () => {
    it('conta threads não lidas e favoritas corretamente', async () => {
      const t1 = { ...MOCK_THREAD, id: 't1', is_unread: true, is_starred: false };
      const t2 = { ...MOCK_THREAD, id: 't2', is_unread: true, is_starred: true };
      const t3 = { ...MOCK_THREAD, id: 't3', is_unread: false, is_starred: true };
      setupDefaultMocks([MOCK_ACCOUNT], [t1, t2, t3]);

      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.threads).toHaveLength(3));

      expect(result.current.unreadCount).toBe(2);
      expect(result.current.starredCount).toBe(2);
    });
  });

  describe('deep link de thread', () => {
    it('busca por UUID e conta quando a thread não está no lote carregado', async () => {
      const outsideThread = { ...MOCK_THREAD, id: 'thread-outside' };
      setupDefaultMocks([MOCK_ACCOUNT], []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string) => makeFromChain([], null, table === 'email_threads' ? outsideThread : null) as any);

      const { result } = renderHook(() => useGmail(undefined, 'thread-outside'), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.requestedThread?.id).toBe('thread-outside'));
      expect(supabase.from).toHaveBeenCalledWith('email_threads');
    });
  });

  describe('subscribeToThreads', () => {
    it('retorna função vazia quando não há activeAccount', async () => {
      setupDefaultMocks([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);

      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      const cleanup = result.current.subscribeToThreads();
      expect(vi.mocked(supabase.channel)).not.toHaveBeenCalled();
      expect(cleanup()).toBeUndefined();
    });

    it('cria canal realtime com 2 listeners e retorna cleanup com removeChannel', async () => {
      setupDefaultMocks();
      const mockCh = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.channel).mockReturnValue(mockCh as any);

      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.activeAccount).toBeDefined());

      const cleanup = result.current.subscribeToThreads();
      expect(supabase.channel).toHaveBeenCalledWith('gmail-threads-realtime');
      expect(mockCh.on).toHaveBeenCalledTimes(2);
      expect(mockCh.subscribe).toHaveBeenCalledOnce();

      cleanup();
      expect(supabase.removeChannel).toHaveBeenCalledWith(mockCh);
    });
  });

  describe('connectGmail / getOAuthReturnView', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
      vi.mocked(callGmailFunction).mockImplementation(async (_fn: string, opts: Record<string, unknown>) => {
        if (opts.action === 'list-accounts') return { accounts: [] };
        if (opts.action === 'get-auth-url') return { url: 'https://accounts.google.com/o/oauth2/auth' };
        return {};
      });
    });

    it('usa ?view= param como returnView e chama location.assign', async () => {
      vi.stubGlobal('location', { search: '?view=gmail', hash: '', assign: vi.fn() });
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      await act(() => result.current.connectGmail.mutateAsync());

      expect(createGmailOAuthState).toHaveBeenCalledWith({ view: 'gmail', integrationView: 'gmail' });
      expect(storeGmailOAuthReturnContext).toHaveBeenCalledWith('gmail', 'gmail');
      expect(window.location.assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth');
    });

    it('usa hash não reservado como returnView', async () => {
      vi.stubGlobal('location', { search: '', hash: '#settings', assign: vi.fn() });
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      await act(() => result.current.connectGmail.mutateAsync());

      expect(createGmailOAuthState).toHaveBeenCalledWith({ view: 'settings', integrationView: 'gmail' });
    });

    it('usa "integrations" quando hash é reservado', async () => {
      vi.stubGlobal('location', { search: '', hash: '#main-content', assign: vi.fn() });
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      await act(() => result.current.connectGmail.mutateAsync());

      expect(createGmailOAuthState).toHaveBeenCalledWith({ view: 'integrations', integrationView: 'gmail' });
    });

    it('usa "integrations" sem ?view= e sem hash', async () => {
      vi.stubGlobal('location', { search: '', hash: '', assign: vi.fn() });
      const { result } = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.accountsLoading).toBe(false));

      await act(() => result.current.connectGmail.mutateAsync());

      expect(createGmailOAuthState).toHaveBeenCalledWith({ view: 'integrations', integrationView: 'gmail' });
    });
  });

  // Contrato com a Edge `gmail-send`: o `action` e o NOME do campo que o handler
  // lê (message_id / thread_id / draft_id) têm de sair do hook exatamente como
  // estão escritos em supabase/functions/gmail-send/index.ts. Trocar o rótulo da
  // ação ou mandar o id em outro campo não dá erro visível: a Edge responde 400
  // ou 404 e a lixeira simplesmente não acontece.
  describe('payload das ações de lixeira e rascunho (contrato com a Edge)', () => {
    function mockActions() {
      vi.mocked(callGmailFunction).mockImplementation(async (fn: string, opts: Record<string, unknown>) => {
        if (fn === 'gmail-oauth' && opts.action === 'list-accounts') return { accounts: [MOCK_ACCOUNT] };
        return { success: true };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
    }

    async function renderReady() {
      const view = renderHook(() => useGmail(), { wrapper: createWrapper() });
      await waitFor(() => expect(view.result.current.accountsLoading).toBe(false));
      return view;
    }

    /** Último par (função, corpo) entregue à Edge. */
    function ultimaChamada(): [string, Record<string, unknown>] {
      const calls = vi.mocked(callGmailFunction).mock.calls;
      return calls[calls.length - 1] as unknown as [string, Record<string, unknown>];
    }

    it('mover mensagem para a lixeira manda action trash com message_id e conta', async () => {
      mockActions();
      const { result, unmount } = await renderReady();

      await act(() => result.current.trashMessage.mutateAsync('gmail-msg-1'));

      const [fn, body] = ultimaChamada();
      expect(fn).toBe('gmail-send');
      expect(body.action).toBe('trash');
      expect(body.message_id).toBe('gmail-msg-1');
      expect(body.account_id).toBe('acc1');
      expect(toast.success).toHaveBeenCalledWith('Email movido para lixeira');
      unmount();
    });

    it('mover conversa para a lixeira manda action trash-thread com thread_id', async () => {
      mockActions();
      const { result, unmount } = await renderReady();

      await act(() => result.current.trashThread.mutateAsync('gmail-t1'));

      const [fn, body] = ultimaChamada();
      expect(fn).toBe('gmail-send');
      expect(body.action).toBe('trash-thread');
      expect(body.thread_id).toBe('gmail-t1');
      expect(toast.success).toHaveBeenCalledWith('Thread movida para lixeira');
      unmount();
    });

    it('salvar rascunho SEM draft_id cria (create-draft) e COM draft_id atualiza (update-draft)', async () => {
      mockActions();
      const { result, unmount } = await renderReady();

      await act(() => result.current.saveDraft.mutateAsync({ to: 'dest@example.com', subject: 'Oi' }));
      let [, body] = ultimaChamada();
      expect(body.action).toBe('create-draft');
      expect(Object.prototype.hasOwnProperty.call(body, 'draft_id')).toBe(false);

      await act(() => result.current.saveDraft.mutateAsync({ draft_id: 'draft-1', to: 'dest@example.com', subject: 'Oi de novo' }));
      [, body] = ultimaChamada();
      expect(body.action).toBe('update-draft');
      expect(body.draft_id).toBe('draft-1');
      unmount();
    });

    it('apagar rascunho manda action delete-draft com draft_id', async () => {
      mockActions();
      const { result, unmount } = await renderReady();

      await act(() => result.current.deleteDraft.mutateAsync('draft-1'));

      const [fn, body] = ultimaChamada();
      expect(fn).toBe('gmail-send');
      expect(body.action).toBe('delete-draft');
      expect(body.draft_id).toBe('draft-1');
      unmount();
    });
  });
});
