import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Cartão t_90dcdcc8, item 2: o card de grupo selecionável para broadcast era uma
// Card/div sem role="button"/tabIndex/onKeyDown — impossível selecionar só com
// teclado. Padrão copiado do PresetCard.tsx (role + tabIndex + Enter/Espaço).

const mockOrder = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({ order: mockOrder }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
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

const grupo = {
  id: 'g1', group_id: '1@g.us', name: 'Meu Grupo', description: 'Desc',
  participant_count: 10, avatar_url: null, is_admin: true, whatsapp_connection_id: 'c1',
  created_at: '2025-01-01', updated_at: '2025-01-01',
};
const conexao = { id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' };

async function renderGrupos() {
  mockOrder
    .mockResolvedValueOnce({ data: [grupo], error: null })
    .mockResolvedValueOnce({ data: [conexao], error: null });
  render(<GroupsView />);
  await screen.findByText('Meu Grupo');
}

describe('GroupsView — card de grupo selecionável por teclado (t_90dcdcc8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrder.mockReset();
  });

  it('o card do grupo é botão com tabIndex e aria-pressed', async () => {
    await renderGrupos();
    const card = screen.getByRole('button', { name: /Meu Grupo/ });
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toHaveAttribute('aria-pressed', 'false');
  });

  it('Enter seleciona e Espaço desmarca o grupo', async () => {
    await renderGrupos();
    const card = screen.getByRole('button', { name: /Meu Grupo/ });

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: /Enviar para 1 grupo/ })).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(card, { key: ' ' });
    expect(screen.queryByRole('button', { name: /Enviar para 1 grupo/ })).not.toBeInTheDocument();
    expect(card).toHaveAttribute('aria-pressed', 'false');
  });
});
