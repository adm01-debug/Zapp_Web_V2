import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-API-062 (#234) + envio em massa por fila.
 *
 * Antes: `handleBroadcast` limpava a seleção incondicionalmente e `onBroadcast`
 * fechava o diálogo e zerava o texto sempre — inclusive quando nenhum envio deu
 * certo, fazendo o usuário perder a mensagem escrita e os grupos escolhidos.
 * Correção daquela rodada: a tentativa (texto + seleção) só é preservada quando
 * NENHUM grupo entrou na fila (`sent === 0`). Na falha parcial — parte dos grupos já
 * está na fila — o diálogo fecha, o texto é limpo e a seleção inteira é descartada,
 * para que um novo clique não reenvie aos grupos que já receberam.
 *
 * Esta rodada troca o laço com 2 s de pausa e chamada direta à `evolution-api` por
 * UMA RPC por grupo (`enqueue_group_outbound_message`). É isso que a tela prova aqui:
 * todos os grupos entram na fila antes de qualquer resposta (a aba pode até
 * desaparecer depois do clique) e o reenvio da mesma mensagem ao mesmo grupo reusa o
 * mesmo `client_message_id`, então a fila não cria uma segunda linha.
 */
const mockOrder = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({ order: mockOrder }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    rpc: mockRpc,
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
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    motion: {
        div: ({ children, ...props }: { children?: import('react').ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: { children?: import('react').ReactNode } & Record<string, unknown>) => <span {...props}>{children}</span>,
      },
      AnimatePresence: ({ children }: { children?: import('react').ReactNode }) => children,
      // Grupos passou a usar o movimento reduzido do sistema (MotionConfig + useReducedMotion).
      MotionConfig: ({ children }: { children?: import('react').ReactNode }) => children,
      useReducedMotion: () => false,
  };
});
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

interface ArgsEnfileiramento {
  p_group_id: string;
  p_client_message_id: string;
  p_content: string;
}

/** Grupos enfileirados, na ordem em que a RPC foi chamada. */
function gruposEnfileirados(): string[] {
  return mockRpc.mock.calls.map((chamada) => (chamada[1] as ArgsEnfileiramento).p_group_id);
}

/** Chaves de idempotência entregues à fila. */
function idsEnfileirados(): string[] {
  return mockRpc.mock.calls.map((chamada) => (chamada[1] as ArgsEnfileiramento).p_client_message_id);
}

/** Promessa sob controle: só resolve quando o teste mandar. */
function adiada() {
  let resolver!: (valor: unknown) => void;
  const promessa = new Promise((res) => { resolver = res; });
  return { promessa, resolver };
}

/**
 * Carrega a tela com os grupos informados (todos vinculados à mesma conexão),
 * seleciona todos pela interface e abre o diálogo de envio com uma mensagem escrita.
 */
async function selecionarTodosEAbrirBroadcast(gruposCarregados: (typeof grupo)[] = [grupo]) {
  mockOrder
    .mockResolvedValueOnce({ data: gruposCarregados, error: null })
    .mockResolvedValueOnce({ data: [conexao], error: null });
  const renderizado = render(<GroupsView />);

  for (const g of gruposCarregados) {
    fireEvent.click(await screen.findByText(g.name));
  }
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Enviar para ${gruposCarregados.length} grupo`) }));

  const textarea = await screen.findByPlaceholderText(PLACEHOLDER_TEXTO);
  fireEvent.change(textarea, { target: { value: MENSAGEM } });
  return { ...renderizado, textarea };
}

describe('GroupsView — broadcast de grupos (#234 / R2-API-062)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrder.mockReset();
    mockInvoke.mockReset();
    mockRpc.mockReset();
  });

  it('mantém texto e destinatários quando NENHUM grupo entra na fila', async () => {
    await selecionarTodosEAbrirBroadcast();
    mockRpc.mockResolvedValue({ data: null, error: new Error('sem conexão de WhatsApp') });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('enqueue_group_outbound_message', {
        p_group_id: 'g1',
        p_client_message_id: expect.any(String),
        p_content: MENSAGEM,
        p_whatsapp_connection_id: 'c1',
      });
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('Nenhum grupo entrou na fila (1 falha(s)) — mensagem e seleção mantidas');
    });

    // O aviso de falha total é único, específico e informa que mensagem e seleção
    // foram mantidas; não pode haver o aviso legado redundante "Enviado para 0".
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(ultimoAviso()).toBe('Nenhum grupo entrou na fila (1 falha(s)) — mensagem e seleção mantidas');

    // Diálogo continua aberto com a mensagem escrita...
    expect(screen.getByPlaceholderText(PLACEHOLDER_TEXTO)).toHaveValue(MENSAGEM);
    // ...e o grupo continua selecionado (destinatários preservados): o botão de envio
    // do cabeçalho só existe enquanto houver seleção. Usamos getByText porque, com o
    // diálogo aberto, o Radix marca o resto da página como aria-hidden e getByRole ignora.
    expect(screen.getByText('Enviar para 1 grupo(s)')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('limpa texto, seleção e fecha o diálogo quando todos os grupos entram na fila', async () => {
    await selecionarTodosEAbrirBroadcast();
    mockRpc.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('1 grupo(s) na fila — o envio continua mesmo se você fechar a aba');
    });
    await waitFor(() => { expect(screen.queryByPlaceholderText(PLACEHOLDER_TEXTO)).not.toBeInTheDocument(); });
    expect(screen.queryByText('Enviar para 1 grupo(s)')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('cada grupo tem o seu registro e fechar a aba depois do clique não interrompe o envio', async () => {
    const pendentes = [adiada(), adiada()];
    const { unmount } = await selecionarTodosEAbrirBroadcast([grupo, grupoDois]);
    mockRpc
      .mockImplementationOnce(() => pendentes[0].promessa)
      .mockImplementationOnce(() => pendentes[1].promessa);

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    // As DUAS chamadas já saíram antes de qualquer resposta: nenhuma espera 2 s pela
    // anterior e nada depende de a aba continuar viva para os grupos restantes.
    await waitFor(() => { expect(mockRpc).toHaveBeenCalledTimes(2); });
    expect(gruposEnfileirados()).toEqual(['g1', 'g2']);
    // Cada grupo tem a sua própria chave de idempotência (um registro por grupo).
    expect(new Set(idsEnfileirados()).size).toBe(2);

    // "Fecha a aba": a tela desaparece e as respostas chegam DEPOIS.
    unmount();
    pendentes.forEach((p) => p.resolver({ data: { id: 'msg-fila' }, error: null }));
    await waitFor(() => { expect(gruposEnfileirados()).toEqual(['g1', 'g2']); });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('descarta a seleção na falha parcial, nomeia o grupo que falhou e reusa a chave no reenvio', async () => {
    await selecionarTodosEAbrirBroadcast([grupo, grupoDois]);
    // Primeiro grupo entra na fila; o segundo falha (falha parcial).
    mockRpc
      .mockResolvedValueOnce({ data: { id: 'msg-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('falha de transporte') });

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.warning).toHaveBeenCalled(); });

    // Diálogo fecha, texto é limpo e a seleção inteira é descartada.
    await waitFor(() => { expect(screen.queryByPlaceholderText(PLACEHOLDER_TEXTO)).not.toBeInTheDocument(); });
    expect(screen.queryByText('Enviar para 2 grupo(s)')).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar para 1 grupo(s)')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();

    // A tentativa anterior alcançou os dois grupos, na ordem da tela.
    expect(gruposEnfileirados()).toEqual(['g1', 'g2']);

    // O resultado sai POR GRUPO: o aviso nomeia quem falhou e NÃO afirma que
    // mensagem/seleção foram mantidas.
    expect(ultimoAviso()).toBe('1 grupo(s) na fila, 1 falha(s): Grupo Dois');

    const chaveDoGrupoQueFalhou = idsEnfileirados()[1];

    // Nova tentativa pela interface: como nada ficou selecionado, o usuário recomeça
    // pelo grupo que falhou — e o grupo que já entrou na fila não é enfileirado de novo.
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

    fireEvent.click(screen.getByText('Grupo Dois'));
    fireEvent.click(await screen.findByRole('button', { name: /Enviar para 1 grupo/ }));
    fireEvent.change(await screen.findByPlaceholderText(PLACEHOLDER_TEXTO), { target: { value: MENSAGEM } });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => { expect(toast.success).toHaveBeenCalled(); });
    expect(gruposEnfileirados()).toEqual(['g2']);
    // MESMA chave de idempotência do primeiro enfileiramento: a RPC acha a linha
    // existente pelo índice único (whatsapp_group_id, client_message_id) e não cria
    // uma segunda — o reenvio não duplica.
    expect(idsEnfileirados()).toEqual([chaveDoGrupoQueFalhou]);
  });
});
