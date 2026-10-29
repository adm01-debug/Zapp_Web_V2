/**
 * t_90d875a4 / t_1f12d992 — o diálogo de transferência do painel do contato
 * deve (a) distinguir sucesso total, sucesso PARCIAL (nota interna não salva)
 * e falha real (nada gravado) e (b) mostrar a lista de destinos com estado de
 * carregando/erro/vazio, `aria-pressed` e o MESMO filtro do TransferDialog
 * (online/ausente; contato sem fila só o próprio usuário). Antes ele mostrava
 * "Conversa transferida com sucesso!" sempre que o callback resolvia e listava
 * todo `profiles.is_active`, inclusive quem o trigger recusaria depois.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HandoffDialog } from '../HandoffDialog';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

type MockAgent = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  status: 'online' | 'away' | 'offline';
};

const agentsState = vi.hoisted(() => ({
  agents: [] as MockAgent[],
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => agentsState }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const ONLINE_SELF: MockAgent = { id: 'agent-1', user_id: 'me', name: 'Fulano', avatar_url: null, status: 'online' };
const ONLINE_OTHER: MockAgent = { id: 'agent-2', user_id: 'other', name: 'Beltrano', avatar_url: null, status: 'online' };
const OFFLINE_OTHER: MockAgent = { id: 'agent-3', user_id: 'other2', name: 'Sicrano', avatar_url: null, status: 'offline' };

function renderDialog(
  onHandoff: (agentId: string, comment: string) => Promise<{ noteSaved: boolean }>,
  queueId: string | null = 'queue-1'
) {
  const qc = new QueryClient();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <HandoffDialog open onOpenChange={onOpenChange} contactId="c1" queueId={queueId} onHandoff={onHandoff} />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

async function selectAgentAndSubmit() {
  const agentButton = await screen.findByRole('button', { name: /Fulano/ });
  fireEvent.click(agentButton);
  fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
}

beforeEach(() => {
  agentsState.agents = [ONLINE_SELF, ONLINE_OTHER, OFFLINE_OTHER];
  agentsState.isLoading = false;
  agentsState.error = null;
  agentsState.refetch.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.warning.mockClear();
});

describe('HandoffDialog — aviso por resultado (sem falso "transferida")', () => {
  it('sucesso total (noteSaved=true): fecha o diálogo e mostra toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    const { onOpenChange } = renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversa transferida com sucesso!')
    );
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sucesso parcial (noteSaved=false): avisa que a nota não foi salva, sem toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: false });
    renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Conversa transferida, mas a nota não pôde ser salva.'
      )
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('callback rejeita (ID inválido, RLS, nada gravado): toast.error e diálogo ABERTO', async () => {
    const onHandoff = vi.fn().mockRejectedValue(new Error('permission denied'));
    const { onOpenChange } = renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao transferir conversa')
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
    // Rejeição = nada foi commitado: o diálogo fica aberto para nova tentativa.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('HandoffDialog — lista de destinos (carregando/erro/vazio/aria-pressed)', () => {
  it('enquanto carrega mostra o estado de carregando, sem listar destinos', () => {
    agentsState.isLoading = true;
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando atendentes');
    expect(screen.queryByRole('button', { name: /Fulano/ })).toBeNull();
  });

  it('em erro mostra role=alert e o botão "Tentar novamente" rechama refetch', () => {
    agentsState.error = new Error('falha de rede');
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os atendentes');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(agentsState.refetch).toHaveBeenCalledTimes(1);
  });

  it('sem destinos disponíveis mostra o estado vazio', () => {
    agentsState.agents = [OFFLINE_OTHER];
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff);

    expect(screen.getByText('Nenhum atendente disponível no momento')).toBeTruthy();
  });

  it('marca o destino escolhido com aria-pressed e desmarca os demais', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff);

    const fulano = await screen.findByRole('button', { name: /Fulano/ });
    const beltrano = screen.getByRole('button', { name: /Beltrano/ });
    expect(fulano.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(fulano);

    expect(fulano.getAttribute('aria-pressed')).toBe('true');
    expect(beltrano.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('HandoffDialog — filtro de destinos (igual ao TransferDialog)', () => {
  it('sem fila: só o próprio usuário aparece e o aviso explica o porquê', () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff, null);

    expect(screen.getByRole('button', { name: /Fulano/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Beltrano/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sicrano/ })).toBeNull();
    expect(screen.getByText(/Contato sem fila: só é possível assumir para você mesmo/)).toBeTruthy();
  });

  it('com fila: mostra os online/ausente e esconde o offline', () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff, 'queue-1');

    expect(screen.getByRole('button', { name: /Fulano/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Beltrano/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sicrano/ })).toBeNull();
  });
});
