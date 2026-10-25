import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionsView } from '../ConnectionsView';

/**
 * t_cce2f0f7 — critério 1: o diálogo de "Nova Conexão" precisa VALIDAR o número
 * brasileiro (DDI 55) antes de chamar a criação, com o erro inline acessível, e
 * o botão mostrar "Criando..." desabilitado durante a chamada.
 *
 * A prova renderiza a tela REAL (`ConnectionsView`) e digita no campo REAL: o
 * erro aparece no `role="alert"` e `handleAddConnection` NÃO é chamado; número
 * válido passa; e um E.164 explícito com outro DDI continua aceito (decisão do
 * cartão irmão t_1fb60ff8, que preserva número internacional na máscara).
 */
const h = vi.hoisted(() => ({
  handleAddConnection: vi.fn(),
  setIsAddDialogOpen: vi.fn(),
  isCreating: { value: false },
  inicial: { name: 'Vendas', phone_number: '' },
  flag: { value: 'true' as string | null },
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

vi.mock('@/hooks/inbox/useConnectionsManager', async () => {
  const { useState } = await import('react');
  return {
    useConnectionsManager: () => {
      const [novo, setNovo] = useState(h.inicial);
      return {
        connections: h.connections,
        loading: false,
        isAddDialogOpen: true,
        setIsAddDialogOpen: h.setIsAddDialogOpen,
        qrCodeDialog: { open: false, status: 'loading', qrCode: null, connectionName: '', errorMessage: '' },
        newConnection: novo,
        setNewConnection: setNovo,
        isCreating: h.isCreating.value,
        syncingHistory: null,
        setSyncingHistory: vi.fn(),
        evolutionLoading: false,
        handleAddConnection: h.handleAddConnection,
        clearAddConnectionError: vi.fn(),
        addConnectionError: null,
        handleShowQrCode: vi.fn(),
        handleRefreshQrCode: vi.fn(),
        handleCopyId: vi.fn(),
        handleDisconnect: vi.fn(),
        handleSetDefault: vi.fn(),
        handleDelete: vi.fn(),
        closeQrDialog: vi.fn(),
      };
    },
  };
});

vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../ConnectionCard', () => ({ ConnectionCard: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/effects/FloatingParticles', () => ({ FloatingParticles: () => null }));

function renderizar() {
  return render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
}

function campoTelefone() {
  return screen.getByPlaceholderText('+55 11 99999-0000');
}

function botaoAdicionar() {
  return screen.getByRole('button', { name: /^(Adicionar|Criando)/ });
}

async function clicarAdicionar() {
  fireEvent.click(botaoAdicionar());
  return waitFor(() => Promise.resolve(), { timeout: 200 });
}

describe('ConnectionsView — validação do telefone em Nova Conexão (t_cce2f0f7)', () => {
  beforeEach(() => {
    h.handleAddConnection.mockClear();
    h.setIsAddDialogOpen.mockClear();
    h.isCreating.value = false;
    h.inicial = { name: 'Vendas', phone_number: '' };
  });

  it('número fora do formato brasileiro: erro inline acessível e a criação NÃO é chamada', async () => {
    renderizar();

    fireEvent.change(campoTelefone(), { target: { value: 'abc' } });
    fireEvent.click(botaoAdicionar());

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/DDI 55/i);
    expect(h.handleAddConnection).not.toHaveBeenCalled();
  });

  it('número curto (DDD sem assinante) também é barrado antes de criar', async () => {
    renderizar();

    fireEvent.change(campoTelefone(), { target: { value: '11 9999' } });
    fireEvent.click(botaoAdicionar());

    expect((await screen.findByRole('alert')).textContent).toMatch(/DDI 55/i);
    expect(h.handleAddConnection).not.toHaveBeenCalled();
  });

  it('número brasileiro com DDI 55 passa e a criação é chamada', async () => {
    renderizar();

    fireEvent.change(campoTelefone(), { target: { value: '+55 11 99999-0000' } });
    fireEvent.click(botaoAdicionar());

    await waitFor(() => expect(h.handleAddConnection).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('E.164 explícito com outro DDI continua aceito (paridade com a máscara internacional)', async () => {
    renderizar();

    fireEvent.change(campoTelefone(), { target: { value: '+351211234567' } });
    fireEvent.click(botaoAdicionar());

    await waitFor(() => expect(h.handleAddConnection).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('corrigir o número limpa o erro inline', async () => {
    renderizar();

    fireEvent.change(campoTelefone(), { target: { value: 'abc' } });
    fireEvent.click(botaoAdicionar());
    await screen.findByRole('alert');

    fireEvent.change(campoTelefone(), { target: { value: '+55 11 98888-7777' } });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('durante a criação o botão mostra "Criando..." e fica desabilitado', async () => {
    h.isCreating.value = true;
    renderizar();

    const botao = botaoAdicionar();
    expect(botao.textContent).toMatch(/Criando/);
    expect(botao).toBeDisabled();
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: /Cancelar/ }))).toBeDisabled();
  });
});
