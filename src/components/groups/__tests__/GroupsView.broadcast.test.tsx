import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-API-062 (#234): "Broadcast de grupos apaga texto e destinatários mesmo quando
 * todos os envios falham".
 *
 * Antes: `handleBroadcast` limpava a seleção incondicionalmente e `onBroadcast`
 * fechava o diálogo e zerava o texto sempre — inclusive quando nenhum envio deu
 * certo, fazendo o usuário perder a mensagem escrita e os grupos escolhidos.
 */
const mockOrder = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({ order: mockOrder }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: mockInvoke },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children?: import('react').ReactNode }) => children,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: import('react').ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: { children?: import('react').ReactNode } & Record<string, unknown>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children?: import('react').ReactNode }) => children,
}));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state"><span>{title}</span></div>,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title?: string; actions?: import('react').ReactNode }) => <div><h1>{title}</h1>{actions}</div>,
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: () => Promise<void>, opts?: { onSuccess?: () => void }) => { try { await fn(); opts?.onSuccess?.(); } catch { /* noop */ } }),
  }),
}));

import { GroupsView } from '@/components/groups/GroupsView';
import { toast } from 'sonner';

const MENSAGEM = 'Olá, clientes! Promoção desta semana.';
const PLACEHOLDER_TEXTO = 'Digite a mensagem para enviar a todos os grupos selecionados...';

const grupo = {
  id: 'g1', group_id: '1@g.us', name: 'Meu Grupo', description: 'Desc', participant_count: 10,
  avatar_url: null, is_admin: true, whatsapp_connection_id: 'c1',
  created_at: '2025-01-01', updated_at: '2025-01-01',
};
const conexao = { id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' };

/** Carrega a tela com um grupo vinculado a uma conexão e abre o diálogo de envio. */
async function abrirBroadcastComGrupoSelecionado() {
  mockOrder.mockResolvedValueOnce({ data: [grupo], error: null }).mockResolvedValueOnce({ data: [conexao], error: null });
  render(<GroupsView />);

  fireEvent.click(await screen.findByText('Meu Grupo'));
  fireEvent.click(await screen.findByRole('button', { name: /Enviar para 1 grupo/ }));

  const textarea = await screen.findByPlaceholderText(PLACEHOLDER_TEXTO);
  fireEvent.change(textarea, { target: { value: MENSAGEM } });
  return textarea;
}

describe('GroupsView — broadcast de grupos (#234 / R2-API-062)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mantém texto e destinatários quando TODOS os envios falham', async () => {
    await abrirBroadcastComGrupoSelecionado();
    mockInvoke.mockResolvedValue({ data: null, error: new Error('falha de transporte') });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api', {
        body: { action: 'send-text', instanceName: 'inst-1', number: '1@g.us', text: MENSAGEM },
      });
    });
    await waitFor(() => { expect(toast.warning).toHaveBeenCalled(); });

    // Diálogo continua aberto com a mensagem escrita...
    expect(screen.getByPlaceholderText(PLACEHOLDER_TEXTO)).toHaveValue(MENSAGEM);
    // ...e o grupo continua selecionado (destinatários preservados): o botão de envio
    // do cabeçalho só existe enquanto houver seleção. Usamos getByText porque, com o
    // diálogo aberto, o Radix marca o resto da página como aria-hidden e getByRole ignora.
    expect(screen.getByText('Enviar para 1 grupo(s)')).toBeInTheDocument();
  });

  it('limpa texto, seleção e fecha o diálogo quando o envio dá certo', async () => {
    await abrirBroadcastComGrupoSelecionado();
    mockInvoke.mockResolvedValue({ data: { key: { id: 'msg-1' } }, error: null });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.success).toHaveBeenCalled(); });
    await waitFor(() => { expect(screen.queryByPlaceholderText(PLACEHOLDER_TEXTO)).not.toBeInTheDocument(); });
    expect(screen.queryByText('Enviar para 1 grupo(s)')).not.toBeInTheDocument();
  });
});
