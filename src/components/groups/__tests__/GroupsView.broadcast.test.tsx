import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-API-062 (#234): "Broadcast de grupos apaga texto e destinatários mesmo quando
 * todos os envios falham".
 *
 * Antes: `handleBroadcast` limpava a seleção incondicionalmente e `onBroadcast`
 * fechava o diálogo e zerava o texto sempre — inclusive quando nenhum envio deu
 * certo, fazendo o usuário perder a mensagem escrita e os grupos escolhidos.
 *
 * Correção desta rodada: a tentativa (texto + seleção) só é preservada quando
 * NENHUM envio deu certo (`sent === 0`). Na falha parcial — parte dos grupos já
 * recebeu — o diálogo fecha, o texto é limpo e a seleção inteira é descartada, para
 * que um novo clique não reenvie aos grupos que já receberam.
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
/** Cada grupo é enviado com 2s de intervalo — os waitFor dos cenários com 2 grupos precisam de folga. */
const ESPERA_ENVIO = { timeout: 6000 };

const grupoBase = {
  description: 'Desc', participant_count: 10, avatar_url: null, is_admin: true,
  whatsapp_connection_id: 'c1', created_at: '2025-01-01', updated_at: '2025-01-01',
};
const grupo = { id: 'g1', group_id: '1@g.us', name: 'Meu Grupo', ...grupoBase };
const grupoDois = { id: 'g2', group_id: '2@g.us', name: 'Grupo Dois', ...grupoBase };
const conexao = { id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' };

/** Último aviso de falha mostrado ao usuário. */
function ultimoAviso(): string {
  const chamadas = vi.mocked(toast.warning).mock.calls;
  return chamadas[chamadas.length - 1]?.[0] as string;
}

/** Números de destino chamados no `evolution-api`, na ordem em que foram enviados. */
function numerosEnviados(): string[] {
  return mockInvoke.mock.calls.map((chamada) => (chamada[1] as { body: { number: string } }).body.number);
}

/**
 * Carrega a tela com os grupos informados (todos vinculados à mesma conexão),
 * seleciona todos pela interface e abre o diálogo de envio com uma mensagem escrita.
 */
async function selecionarTodosEAbrirBroadcast(gruposCarregados: (typeof grupo)[] = [grupo]) {
  mockOrder
    .mockResolvedValueOnce({ data: gruposCarregados, error: null })
    .mockResolvedValueOnce({ data: [conexao], error: null });
  render(<GroupsView />);

  for (const g of gruposCarregados) {
    fireEvent.click(await screen.findByText(g.name));
  }
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Enviar para ${gruposCarregados.length} grupo`) }));

  const textarea = await screen.findByPlaceholderText(PLACEHOLDER_TEXTO);
  fireEvent.change(textarea, { target: { value: MENSAGEM } });
  return textarea;
}

describe('GroupsView — broadcast de grupos (#234 / R2-API-062)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrder.mockReset();
    mockInvoke.mockReset();
  });

  it('mantém texto e destinatários quando TODOS os envios falham', async () => {
    await selecionarTodosEAbrirBroadcast();
    mockInvoke.mockResolvedValue({ data: null, error: new Error('falha de transporte') });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api', {
        body: { action: 'send-text', instanceName: 'inst-1', number: '1@g.us', text: MENSAGEM },
      });
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('Nenhum envio deu certo (1 falha(s)) — mensagem e seleção mantidas');
    });

    // O aviso de falha total é único, específico e informa que mensagem e seleção
    // foram mantidas; não pode haver o aviso legado redundante "Enviado para 0".
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(ultimoAviso()).toBe('Nenhum envio deu certo (1 falha(s)) — mensagem e seleção mantidas');

    // Diálogo continua aberto com a mensagem escrita...
    expect(screen.getByPlaceholderText(PLACEHOLDER_TEXTO)).toHaveValue(MENSAGEM);
    // ...e o grupo continua selecionado (destinatários preservados): o botão de envio
    // do cabeçalho só existe enquanto houver seleção. Usamos getByText porque, com o
    // diálogo aberto, o Radix marca o resto da página como aria-hidden e getByRole ignora.
    expect(screen.getByText('Enviar para 1 grupo(s)')).toBeInTheDocument();
  });

  it('limpa texto, seleção e fecha o diálogo quando o envio dá certo', async () => {
    await selecionarTodosEAbrirBroadcast();
    mockInvoke.mockResolvedValue({ data: { key: { id: 'msg-1' } }, error: null });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.success).toHaveBeenCalled(); });
    await waitFor(() => { expect(screen.queryByPlaceholderText(PLACEHOLDER_TEXTO)).not.toBeInTheDocument(); });
    expect(screen.queryByText('Enviar para 1 grupo(s)')).not.toBeInTheDocument();
  });

  it('descarta a seleção na falha parcial e impede que um novo envio alcance o grupo que já recebeu', async () => {
    await selecionarTodosEAbrirBroadcast([grupo, grupoDois]);
    // Primeiro grupo recebe; o segundo falha (falha parcial).
    mockInvoke
      .mockResolvedValueOnce({ data: { key: { id: 'msg-1' } }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('falha de transporte') });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.warning).toHaveBeenCalled(); }, ESPERA_ENVIO);

    // Diálogo fecha, texto é limpo e a seleção inteira é descartada.
    await waitFor(() => { expect(screen.queryByPlaceholderText(PLACEHOLDER_TEXTO)).not.toBeInTheDocument(); }, ESPERA_ENVIO);
    expect(screen.queryByText('Enviar para 2 grupo(s)')).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar para 1 grupo(s)')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();

    // A tentativa anterior alcançou os dois grupos, na ordem da tela.
    expect(numerosEnviados()).toEqual(['1@g.us', '2@g.us']);

    // O aviso de falha parcial NÃO afirma que mensagem/seleção foram mantidas.
    expect(ultimoAviso()).not.toMatch(/mantid/i);

    // Nova tentativa pela interface: como nada ficou selecionado, o usuário recomeça
    // pelo grupo que falhou — e o grupo que já recebeu não é chamado de novo.
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ data: { key: { id: 'msg-2' } }, error: null });

    fireEvent.click(screen.getByText('Grupo Dois'));
    fireEvent.click(await screen.findByRole('button', { name: /Enviar para 1 grupo/ }));
    fireEvent.change(await screen.findByPlaceholderText(PLACEHOLDER_TEXTO), { target: { value: MENSAGEM } });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.success).toHaveBeenCalled(); });
    expect(numerosEnviados()).toEqual(['2@g.us']);
  });
});
