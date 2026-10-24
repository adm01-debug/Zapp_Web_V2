import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockOrder = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const mockUpsert = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({ order: mockOrder }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: mockUpsert,
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
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: { children?: import("react").ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: import("react").ReactNode }) => children,
}));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state"><span>{title}</span></div>,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title?: string; actions?: import("react").ReactNode }) => <div><h1>{title}</h1>{actions}</div>,
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: () => Promise<void>, opts?: { onSuccess?: () => void }) => { try { await fn(); opts?.onSuccess?.(); } catch (err) { log.error('Unexpected error in GroupsView.test:', err); } }),
  }),
}));

import { GroupsView } from '@/components/groups/GroupsView';
import { toast } from 'sonner';

import { getLogger } from '@/lib/logger';
const log = getLogger('GroupsView.test');

// DropdownMenuTrigger do Radix abre no pointerdown, não no click — um clique
// real de mouse sempre dispara os dois eventos nessa ordem.
function openViaPointer(el: Element) {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.click(el);
}

const grupo = (over: Record<string, unknown>) => ({
  description: 'Desc', participant_count: 10, avatar_url: null, is_admin: false,
  whatsapp_connection_id: null, created_at: '2025-01-01', updated_at: '2025-01-01',
  ...over,
});
const GRUPO_A = grupo({ id: 'g1', group_id: '1@g.us', name: 'Meu Grupo' });
const GRUPO_B = grupo({ id: 'g2', group_id: '2@g.us', name: 'Grupo B' });

describe('GroupsView', () => {
  beforeEach(() => { vi.clearAllMocks(); mockOrder.mockResolvedValue({ data: [], error: null }); mockUpsert.mockResolvedValue({ error: null }); });

  it('renders the page title', async () => { render(<GroupsView />); expect(screen.getByText('Grupos WhatsApp')).toBeInTheDocument(); });

  it('shows empty state when no groups', async () => { render(<GroupsView />); await waitFor(() => { expect(screen.getByTestId('empty-state')).toBeInTheDocument(); }); });

  it('renders groups when data loads', async () => {
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'Meu Grupo', is_admin: true })], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Meu Grupo')).toBeInTheDocument(); expect(screen.getByText('10 participantes')).toBeInTheDocument(); });
  });

  it('filters groups by search', async () => {
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'Marketing', participant_count: 5 }), grupo({ id: 'g2', group_id: '2@g.us', name: 'Vendas', participant_count: 8 })], error: null }).mockResolvedValueOnce({ data: [], error: null });
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
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'AG', participant_count: 5, is_admin: true })], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Admin')).toBeInTheDocument(); });
  });

  it('shows connection name for linked groups', async () => {
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'L', participant_count: 5, whatsapp_connection_id: 'c1' })], error: null }).mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WBiz', phone_number: '5511', instance_id: 'i1' }], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('WBiz')).toBeInTheDocument(); });
  });

  it('shows "Não vinculado" for unlinked groups', async () => {
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'O', participant_count: 3 })], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Não vinculado')).toBeInTheDocument(); });
  });

  it('shows select all when groups exist', async () => {
    mockOrder.mockResolvedValueOnce({ data: [grupo({ id: 'g1', group_id: '1@g.us', name: 'G1', participant_count: 5 })], error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(<GroupsView />);
    await waitFor(() => { expect(screen.getByText('Selecionar todos')).toBeInTheDocument(); });
  });

  // R2-API-042: a Edge Function responde 200 com a falha lógica no corpo (`data.error`).
  // Sem a correção, a sincronização anuncia sucesso e o envio em massa conta enviado.
  it('sync trata erro lógico da Evolution (data.error) como falha', async () => {
    mockOrder
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' }], error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockInvoke.mockResolvedValue({ data: { error: 'falha' }, error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Sincronizar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sincronizar'));
    await waitFor(() => { expect(toast.warning).toHaveBeenCalledWith('Sincronização parcial: 0 grupos, 1 erro(s)'); });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sync não grava os grupos que vieram junto da recusa da Evolution', async () => {
    mockOrder
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' }], error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    // Forma real do proxy: 200 com { error: true, message } — aqui ainda trazendo grupos.
    mockInvoke.mockResolvedValue({ data: { error: true, message: 'Instância desconectada', data: [{ id: '9@g.us', subject: 'Grupo Recusado' }] }, error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Sincronizar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sincronizar'));
    await waitFor(() => { expect(toast.warning).toHaveBeenCalledWith('Sincronização parcial: 0 grupos, 1 erro(s)'); });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('envio em massa trata erro lógico da Evolution (data.error) como falha', async () => {
    const grupo = { id: 'g1', group_id: '1@g.us', name: 'Grupo Alvo', description: null, participant_count: 5, avatar_url: null, is_admin: false, whatsapp_connection_id: 'c1', created_at: '2025-01-01', updated_at: '2025-01-01' };
    mockOrder
      .mockResolvedValueOnce({ data: [grupo], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' }], error: null });
    mockOrder.mockResolvedValue({ data: [grupo], error: null });
    mockInvoke.mockResolvedValue({ data: { error: 'falha' }, error: null });
    render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Grupo Alvo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Grupo Alvo'));
    await waitFor(() => expect(screen.getByText('Enviar para 1 grupo(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Enviar para 1 grupo(s)'));
    const campo = await screen.findByPlaceholderText('Digite a mensagem para enviar a todos os grupos selecionados...');
    fireEvent.change(campo, { target: { value: 'Olá' } });
    fireEvent.click(screen.getByText('Enviar'));
    await waitFor(() => { expect(toast.warning).toHaveBeenCalledWith('Nenhum envio deu certo (1 falha(s)) — mensagem e seleção mantidas'); });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  // Regressão R2-API-061 (#233): o item "Enviar mensagem" do menu do card
  // precisa INCLUIR o grupo no público de forma idempotente. Antes o callback
  // chamava toggleGroupSelection, então com o grupo já selecionado ele era
  // retirado dos destinatários.
  it('mantém nos destinatários o grupo já selecionado ao usar "Enviar mensagem" no menu', async () => {
    mockOrder.mockResolvedValueOnce({ data: [GRUPO_A], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const { container } = render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Meu Grupo')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Meu Grupo'));
    expect(screen.getByText('Enviar para 1 grupo(s)')).toBeInTheDocument();

    openViaPointer(container.querySelector('button[aria-haspopup="menu"]')!);
    fireEvent.click(await screen.findByText('Enviar mensagem'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(within(dialog).getByText('Meu Grupo')).toBeInTheDocument();
  });

  it('com A e B selecionados, o menu de A não converte o público em somente B', async () => {
    mockOrder.mockResolvedValueOnce({ data: [GRUPO_A, GRUPO_B], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const { container } = render(<GroupsView />);
    await waitFor(() => expect(screen.getByText('Grupo B')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Selecionar todos'));
    expect(screen.getByText('Enviar para 2 grupo(s)')).toBeInTheDocument();

    openViaPointer(container.querySelectorAll('button[aria-haspopup="menu"]')[0]);
    fireEvent.click(await screen.findByText('Enviar mensagem'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2', { selector: 'strong' })).toBeInTheDocument();
    expect(within(dialog).getByText('Meu Grupo, Grupo B')).toBeInTheDocument();
  });
});
