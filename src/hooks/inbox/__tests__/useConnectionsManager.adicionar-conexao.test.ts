import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * t_d7557d7a — comportamento do gerente de conexões no fluxo de ADICIONAR
 * (e vizinhos de excluir/desconectar), que a V2 não cobria.
 *
 * Foco do cartão: adicionar conexão (sucesso, campos vazios, telefone inválido,
 * erro da Edge sem criar linha local). O realtime (canal único/cleanup/toast
 * único) e o histórico não suportado já têm teste próprio, feito pelos cartões
 * pai — este arquivo não os duplica.
 *
 * Regra do arquivo: cada asserção chama o código REAL do hook; nenhum teste
 * passa se a linha correspondente de produção for removida (prova por mutação
 * registrada no relato).
 */
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  deleteFn: vi.fn(),
  eq: vi.fn(),
  updateFn: vi.fn(),
  updateEq: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  createConnection: vi.fn(),
  connectInstance: vi.fn(),
  deleteInstance: vi.fn(),
  disconnectInstance: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: vi.fn(),
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    error: (...args: unknown[]) => mocks.logError(...args),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: (...args: unknown[]) => mocks.createConnection(...args),
    connectInstance: (...args: unknown[]) => mocks.connectInstance(...args),
    getInstanceStatus: vi.fn(),
    disconnectInstance: (...args: unknown[]) => mocks.disconnectInstance(...args),
    deleteInstance: (...args: unknown[]) => mocks.deleteInstance(...args),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';
import { normalizeE164BR } from '@/lib/calls/phone';

const CRUA = '(11) 98654-3210';
const E164_ESPERADO = normalizeE164BR(CRUA) as string;

const CONEXAO: WhatsAppConnection = {
  id: 'c1',
  name: 'Vendas',
  phone_number: '+55 11 90000-0000',
  instance_id: 'inst-1',
  status: 'connected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-08T00:00:00.000Z',
};

function toastTitles(): (string | undefined)[] {
  return mocks.toast.mock.calls.map((call) => (call[0] as { title?: string }).title);
}

function ultimoToast(): { title?: string; description?: string } {
  const chamadas = mocks.toast.mock.calls;
  return (chamadas[chamadas.length - 1]?.[0] ?? {}) as { title?: string; description?: string };
}

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

async function abrirDialogoEInformar(
  result: Awaited<ReturnType<typeof mount>>,
  name: string,
  phone_number: string,
) {
  await act(async () => {
    result.current.setIsAddDialogOpen(true);
    result.current.setNewConnection({ name, phone_number });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [CONEXAO], error: null });
  mocks.deleteFn.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.updateFn.mockReturnValue({ eq: mocks.updateEq });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => ({
    select: mocks.select,
    insert: mocks.insert,
    delete: mocks.deleteFn,
    update: mocks.updateFn,
  }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.createConnection.mockResolvedValue({});
  mocks.connectInstance.mockResolvedValue({});
  mocks.deleteInstance.mockResolvedValue({ ok: true });
  mocks.disconnectInstance.mockResolvedValue({ ok: true });
});

describe('handleAddConnection — sucesso', () => {
  it('cria na Edge, fecha o diálogo, limpa o formulário e abre o QR da conexão devolvida', async () => {
    const devolvida = { ...CONEXAO, id: 'nova-1', instance_id: 'inst-nova', status: 'pending' as const };
    mocks.createConnection.mockResolvedValue({ connection: devolvida });
    const result = await mount();
    await abrirDialogoEInformar(result, 'Suporte', CRUA);

    await act(async () => { await result.current.handleAddConnection(); });

    // A Edge recebe o E.164 normalizado (não a máscara crua) e o nome.
    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Suporte', phone_number: E164_ESPERADO }),
    );
    // A instância recebe um nome único derivado do nome da conexão.
    const instancia = (mocks.createConnection.mock.calls[0]?.[0] as { instanceName?: string }).instanceName;
    expect(instancia).toMatch(/^suporte_[0-9]{6}$/);
    expect(toastTitles()).toContain('Conexão criada!');
    // Diálogo fechado e formulário limpo.
    expect(result.current.isAddDialogOpen).toBe(false);
    expect(result.current.newConnection).toEqual({ name: '', phone_number: '' });
    // QR aberto para a conexão devolvida pela Edge.
    expect(result.current.qrCodeDialog.open).toBe(true);
    expect(result.current.qrCodeDialog.connectionId).toBe('nova-1');
    expect(mocks.connectInstance).toHaveBeenCalledWith('inst-nova');
  });

  it('recusa formulário sem nome/telefone e NÃO chama a Edge', async () => {
    const result = await mount();
    await abrirDialogoEInformar(result, '', '');

    await act(async () => { await result.current.handleAddConnection(); });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(ultimoToast().title).toBe('Erro');
    expect(ultimoToast().description).toBe('Preencha o nome e o número do telefone.');
  });
});

describe('handleAddConnection — erro da Edge não cria linha local', () => {
  it('mostra o erro, mantém o formulário e não insere em whatsapp_connections', async () => {
    mocks.createConnection.mockRejectedValue(new Error('A Evolution GO recusou a criação da instância.'));
    const result = await mount();
    await abrirDialogoEInformar(result, 'Suporte', CRUA);

    await act(async () => { await result.current.handleAddConnection(); });

    expect(ultimoToast().title).toBe('Erro ao criar conexão');
    expect(ultimoToast().description).toBe('A Evolution GO recusou a criação da instância.');
    // Quem cria a linha é a Edge (create-connection); o front nunca insere.
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalled();
    // Nada foi fechado/limpo: o operador pode corrigir e tentar de novo.
    expect(result.current.isAddDialogOpen).toBe(true);
    expect(result.current.newConnection).toEqual({ name: 'Suporte', phone_number: CRUA });
    expect(result.current.isCreating).toBe(false);
  });
});

describe('handleShowQrCode — conexão sem instância', () => {
  it('avisa em pt-BR e não chama connectInstance', async () => {
    const result = await mount();

    await act(async () => {
      await result.current.handleShowQrCode({ ...CONEXAO, instance_id: null });
    });

    expect(mocks.connectInstance).not.toHaveBeenCalled();
    expect(ultimoToast().title).toBe('Erro');
    expect(ultimoToast().description).toBe('Esta conexão não possui uma instância configurada.');
    expect(result.current.qrCodeDialog.open).toBe(false);
  });
});

describe('handleDelete — exclusão e falha na limpeza local', () => {
  it('sucesso remove a conexão da lista e anuncia a exclusão', async () => {
    const result = await mount();

    await act(async () => { await result.current.handleDelete(CONEXAO); });

    expect(mocks.deleteInstance).toHaveBeenCalledWith('inst-1');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'c1');
    expect(result.current.connections).toHaveLength(0);
    expect(ultimoToast().title).toBe('Conexão removida');
    expect(ultimoToast().description).toBe('A conexão foi excluída com sucesso.');
  });

  it('falha ao apagar o vínculo local vira "Exclusão pendente" e mantém a conexão', async () => {
    mocks.eq.mockResolvedValue({ error: { message: 'permission denied' } });
    const result = await mount();

    await act(async () => { await result.current.handleDelete(CONEXAO); });

    expect(ultimoToast().title).toBe('Exclusão pendente');
    expect(result.current.connections).toHaveLength(1);
    expect(toastTitles()).not.toContain('Conexão removida');
  });
});

describe('handleDisconnect — falha da Edge', () => {
  it('avisa e não marca a conexão como desconectada', async () => {
    mocks.disconnectInstance.mockRejectedValue(new Error('Evolution GO fora do ar'));
    const result = await mount();

    await act(async () => { await result.current.handleDisconnect(CONEXAO); });

    expect(ultimoToast().title).toBe('Erro ao desconectar');
    expect(ultimoToast().description).toBe('Evolution GO fora do ar');
    expect(mocks.updateFn).not.toHaveBeenCalled();
    expect(result.current.connections[0]?.status).toBe('connected');
  });
});
