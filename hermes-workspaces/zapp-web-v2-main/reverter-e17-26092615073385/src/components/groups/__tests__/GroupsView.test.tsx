// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockOrder = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({ order: mockOrder }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
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
  AuthProvider: ({ children }: any) => children,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state"><span>{title}</span></div>,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: any) => <div><h1>{title}</h1>{actions}</div>,
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: any, opts: any) => { try { await fn(); opts?.onSuccess?.(); } catch (err) { log.error('Unexpected error in GroupsView.test:', err); } }),
  }),
}));

import { GroupsView } from '@/components/groups/GroupsView';
import { toast } from 'sonner';

import { getLogger } from '@/lib/logger';
const log = getLogger('GroupsView.test');

describe('GroupsView', () => {
  beforeEach(() => { vi.clearAllMocks(); mockOrder.mockResolvedValue({ data: [], error: null }); });

  it('renders the page title', async () => { render(<GroupsView />); expect(screen.getByText('Grupos WhatsApp')).toBeInTheDocument(); });

  it('shows empty state when no groups', async () => { render(<GroupsView />); await waitFor(() => { expect(screen.getByTestId('empty-state')).toBeInTheDocument(); }); });

  it('renders groups when data loads', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'Meu Grupo', description: 'Desc', participant_count: 10, avatar_url: null, is_admin: true, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Meu Grupo')).toBeInTheDocument(); expect(screen.getByText('10 participantes')).toBeInTheDocument(); });
  });

  it('filters groups by search', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'Marketing', description: null, participant_count: 5, avatar_url: null, is_admin: false, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }, { id: 'g2', group_id: '2@g.us', name: 'Vendas', description: null, participant_count: 8, avatar_url: null, is_admin: false, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou ID do grupo...'), { target: { value: 'Vendas' } });
    expect(screen.queryByText('Marketing')).not.toBeInTheDocument();
    expect(screen.getByText('Vendas')).toBeInTheDocument();
  });

  it('shows error toast on fetch failure', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'err' } }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(toast.error).toHaveBeenCalledWith('Erro ao carregar grupos'); });
  });

  it('calls sync with connections', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' }], error: null });
    mockInvoke.mockResolvedValue({ data: [], error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Sincronizar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sincronizar'));
    await waitFor(() => { expect(mockInvoke).toHaveBeenCalledWith('evolution-api', { body: { action: 'list-groups', instanceName: 'inst-1', getParticipants: 'false' } }); });
  });

  it('shows no-connections error on sync', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Sincronizar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sincronizar'));
    await waitFor(() => { expect(toast.error).toHaveBeenCalledWith('Nenhuma conexão WhatsApp configurada'); });
  });

  it('shows Admin badge', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'AG', description: null, participant_count: 5, avatar_url: null, is_admin: true, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Admin')).toBeInTheDocument(); });
  });

  it('shows connection name for linked groups', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'L', description: null, participant_count: 5, avatar_url: null, is_admin: false, whatsapp_connection_id: 'c1', created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WBiz', phone_number: '5511', instance_id: 'i1' }], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('WBiz')).toBeInTheDocument(); });
  });

  it('shows "Não vinculado" for unlinked groups', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'O', description: null, participant_count: 3, avatar_url: null, is_admin: false, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Não vinculado')).toBeInTheDocument(); });
  });

  it('shows select all when groups exist', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'g1', group_id: '1@g.us', name: 'G1', description: null, participant_count: 5, avatar_url: null, is_admin: false, whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Selecionar todos')).toBeInTheDocument(); });
  });
});
