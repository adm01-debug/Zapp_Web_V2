/**
 * R2-PLAT-005 (#443): falha de carregamento de notificações aparecia como
 * ausência confirmada. O popover não consumia `loading` nem um estado de erro e
 * anunciava "Tudo em dia! / Nenhuma notificação no momento" sempre que a lista
 * estava vazia — inclusive no instante da primeira consulta e no caso de erro do
 * banco, quando a inexistência de notificações NÃO foi confirmada.
 *
 * Estes testes renderizam o NotificationsPopover REAL com o `useNotifications`
 * REAL (só o cliente Supabase e a sessão entram mockados) e cobrem os quatro
 * estados: carregando, erro (com nova tentativa), vazio confirmado e lista.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { useNotifications } from '@/hooks/system/useNotifications';

// Radix Popover não abre de forma confiável sob jsdom (padrão já usado nos testes
// de inbox). Pass-through que renderiza o conteúdo sempre, para exercitar o corpo
// real do popover com o gatilho do usuário preservado.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: auth.user }),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

const supa = vi.hoisted(() => ({ limit: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: supa.limit }),
        }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
    removeChannel: () => {},
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

type NotificationsHookReturn = ReturnType<typeof useNotifications>;

const hookApi = vi.hoisted(() => ({ current: null as NotificationsHookReturn | null }));

vi.mock('@/hooks/system/useNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/system/useNotifications')>();

  return {
    ...actual,
    useNotifications: () => {
      const value = actual.useNotifications();
      hookApi.current = value;
      return value;
    },
  };
});

import { NotificationsPopover } from '@/components/notifications/NotificationsPopover';

const ITEM = {
  id: 'n1',
  user_id: 'u1',
  title: 'Título novo',
  message: 'Mensagem da notificação',
  type: 'info' as const,
  is_read: false,
  metadata: {},
  created_at: new Date().toISOString(),
  read_at: null,
};

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function popoverUi(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <NotificationsPopover />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  supa.limit.mockReset();
  auth.user = { id: 'u1' };
  hookApi.current = null;
});

describe('NotificationsPopover — R2-PLAT-005 (#443)', () => {
  it('carregando: a primeira consulta pendente NÃO anuncia ausência', async () => {
    supa.limit.mockImplementation(() => new Promise(() => {}));

    render(popoverUi(makeQc()));

    expect(await screen.findByText(/carregando notifica/i)).toBeInTheDocument();
    expect(screen.queryByText('Tudo em dia!')).toBeNull();
    expect(screen.queryByText('Nenhuma notificação no momento')).toBeNull();
  });

  it('erro: a consulta que falha mostra erro + nova tentativa, não ausência', async () => {
    supa.limit.mockResolvedValue({ data: null, error: new Error('rede fora') });

    render(popoverUi(makeQc()));

    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar as notifica/i)).toBeInTheDocument();
    expect(screen.queryByText('Tudo em dia!')).toBeNull();
    expect(screen.queryByText('Nenhuma notificação no momento')).toBeNull();
  });

  it('erro: "Tentar novamente" refaz a consulta e renderiza a lista real', async () => {
    supa.limit
      .mockResolvedValueOnce({ data: null, error: new Error('rede fora') })
      .mockResolvedValue({ data: [ITEM], error: null });

    render(popoverUi(makeQc()));

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Título novo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
    expect(screen.queryByText('Nenhuma notificação no momento')).toBeNull();
  });

  it('vazio confirmado: só anuncia ausência quando a consulta respondeu sem linhas', async () => {
    supa.limit.mockResolvedValue({ data: [], error: null });

    render(popoverUi(makeQc()));

    expect(await screen.findByText('Tudo em dia!')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma notificação no momento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });

  it('lista disponível: renderiza as notificações e não mostra ausência', async () => {
    supa.limit.mockResolvedValue({ data: [ITEM], error: null });

    render(popoverUi(makeQc()));

    expect(await screen.findByText('Título novo')).toBeInTheDocument();
    expect(screen.queryByText('Tudo em dia!')).toBeNull();
  });

  it('atualização falha após uma lista carregada: conserva os itens do mesmo usuário e avisa que a atualização falhou', async () => {
    supa.limit
      .mockResolvedValueOnce({ data: [ITEM], error: null })
      .mockResolvedValue({ data: null, error: new Error('rede fora') });

    render(popoverUi(makeQc()));
    expect(await screen.findByText('Título novo')).toBeInTheDocument();

    await act(async () => {
      await hookApi.current?.refetch();
    });

    expect(await screen.findByText(/não foi possível atualizar as notifica/i)).toBeInTheDocument();
    expect(screen.getByText('Título novo')).toBeInTheDocument();
    expect(auth.user?.id).toBe('u1');
  });

  it('troca de usuário com falha limpa a lista da conta anterior antes de mostrar o erro', async () => {
    supa.limit
      .mockResolvedValueOnce({ data: [ITEM], error: null })
      .mockResolvedValue({ data: null, error: new Error('rede fora') });

    const qc = makeQc();
    const { rerender } = render(popoverUi(qc));
    expect(await screen.findByText('Título novo')).toBeInTheDocument();

    auth.user = { id: 'u2' };
    rerender(popoverUi(qc));

    expect(await screen.findByText(/não foi possível carregar as notifica/i)).toBeInTheDocument();
    expect(screen.queryByText('Título novo')).toBeNull();
    expect(screen.queryByText(/não foi possível atualizar as notifica/i)).toBeNull();
  });
});
