import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionsView } from '../ConnectionsView';

/**
 * SL-075 / F6 E42 — "Trava de Nova conexão até F1–F3".
 *
 * A trava existe no botão do cabeçalho (disabled enquanto
 * `global_settings.multi_connection_enabled` != 'true'), mas o estado vazio
 * ("Nenhuma conexão configurada") abria o MESMO diálogo por outro caminho
 * (`EmptyState ... onAction={() => setIsAddDialogOpen(true)}`), sem passar
 * pela chave. Com a trava ligada, o operador ainda conseguia iniciar a
 * criação de uma conexão inoperante — exatamente o que a E42 impede.
 *
 * O que se prova aqui é o caminho do clique (estrutura), não aparência:
 * com a chave desligada NENHUM botão do estado vazio pode abrir o diálogo,
 * e o estado vazio diz por que a criação está travada.
 */
const h = vi.hoisted(() => ({
  setIsAddDialogOpen: vi.fn(),
  handleAddConnection: vi.fn(),
  flag: { value: 'false' as string | null },
  connections: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: h.flag.value === null ? null : { value: h.flag.value }, error: null });
      return chain;
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

vi.mock('@/hooks/inbox/useConnectionsManager', () => ({
  useConnectionsManager: () => ({
    connections: h.connections,
    loading: false,
    isAddDialogOpen: false,
    setIsAddDialogOpen: h.setIsAddDialogOpen,
    qrCodeDialog: { open: false, status: 'loading', qrCode: null, connectionName: '', errorMessage: '' },
    newConnection: { name: '', phone_number: '' },
    setNewConnection: vi.fn(),
    isCreating: false,
    syncingHistory: null,
    setSyncingHistory: vi.fn(),
    evolutionLoading: false,
    handleAddConnection: h.handleAddConnection,
    handleShowQrCode: vi.fn(),
    handleRefreshQrCode: vi.fn(),
    handleCopyId: vi.fn(),
    handleDisconnect: vi.fn(),
    handleSetDefault: vi.fn(),
    handleDelete: vi.fn(),
    closeQrDialog: vi.fn(),
  }),
}));

vi.mock('../IntegrationsPanel', () => ({ IntegrationsPanel: () => null }));
vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../ConnectionCard', () => ({ ConnectionCard: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

async function renderComEstadoVazio(flag: string | null) {
  h.flag.value = flag;
  h.connections = [];
  const utils = render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('Nenhuma conexão configurada')).toBeInTheDocument());
  return utils;
}

describe('ConnectionsView — trava de "Nova conexão" (multi_connection_enabled)', () => {
  beforeEach(() => {
    h.setIsAddDialogOpen.mockClear();
    h.handleAddConnection.mockClear();
  });

  it('chave desligada: o estado vazio não oferece caminho para abrir o diálogo', async () => {
    await renderComEstadoVazio('false');

    const cta = screen.queryByRole('button', { name: /adicionar conexão/i });
    if (cta) fireEvent.click(cta);

    expect(h.setIsAddDialogOpen).not.toHaveBeenCalled();
    expect(cta === null || (cta as HTMLButtonElement).disabled).toBe(true);
  });

  it('chave desligada: o botão do cabeçalho continua desabilitado', async () => {
    await renderComEstadoVazio('false');
    expect(screen.getByRole('button', { name: /nova conexão/i })).toBeDisabled();
  });

  it('chave desligada: o estado vazio explica a trava em vez de convidar a criar', async () => {
    await renderComEstadoVazio('false');
    expect(screen.queryByText(/não estão habilitadas neste sistema/i)).not.toBeNull();
  });

  it('chave ligada: o estado vazio volta a abrir o diálogo', async () => {
    await renderComEstadoVazio('true');

    const cta = screen.getByRole('button', { name: /adicionar conexão/i });
    expect(screen.getByRole('button', { name: /nova conexão/i })).toBeEnabled();
    fireEvent.click(cta);

    expect(h.setIsAddDialogOpen).toHaveBeenCalledWith(true);
  });

  it('chave ausente (linha inexistente) mantém a trava fechada', async () => {
    await renderComEstadoVazio(null);

    const cta = screen.queryByRole('button', { name: /adicionar conexão/i });
    if (cta) fireEvent.click(cta);

    expect(h.setIsAddDialogOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /nova conexão/i })).toBeDisabled();
  });
});
