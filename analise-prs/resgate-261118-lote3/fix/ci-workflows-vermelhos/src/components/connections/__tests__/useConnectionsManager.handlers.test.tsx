// t_3cd6be4a — handlers do `useConnectionsManager` que estavam sem teste na V2:
//   handleDisconnect, handleAddConnection, handleShowQrCode (sem instância),
//   o polling de status até `connected` e a rede de segurança de 30 s do QR.
//
// PL-07 (fila, horário, abas e reconexão automática) NÃO é tocado aqui; os testes
// exercitam o código de produção importado (`@/hooks/inbox/useConnectionsManager`),
// com Supabase e Evolution falsos, para que cada `expect` falhe se o handler
// perder o comportamento — não são guardas de fonte.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  useConnectionsManager,
  type WhatsAppConnection,
} from '@/hooks/inbox/useConnectionsManager';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  selectOrder: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  toast: vi.fn(),
  log: { debug: vi.fn(), error: vi.fn() },
  createConnection: vi.fn(),
  connectInstance: vi.fn(),
  getInstanceStatus: vi.fn(),
  disconnectInstance: vi.fn(),
  deleteInstance: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...a: unknown[]) => h.from(...a),
    channel: (...a: unknown[]) => h.channel(...a),
    removeChannel: (...a: unknown[]) => h.removeChannel(...a),
  },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...a: unknown[]) => h.toast(...a) }));
vi.mock('@/lib/logger', () => ({ log: h.log, createLogger: () => h.log }));
vi.mock('@/lib/clipboard', () => ({ avisarCopia: vi.fn(), copiarTexto: vi.fn() }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: h.createConnection,
    connectInstance: h.connectInstance,
    getInstanceStatus: h.getInstanceStatus,
    disconnectInstance: h.disconnectInstance,
    deleteInstance: h.deleteInstance,
  }),
}));

const A: WhatsAppConnection = {
  id: 'A', name: 'Principal', phone_number: '5511900000001',
  instance_id: 'inst-A', status: 'disconnected', qr_code: null, is_default: true,
  created_at: '2026-01-01T00:00:00.000Z',
};
const B: WhatsAppConnection = {
  id: 'B', name: 'Vendas', phone_number: '5511900000002',
  instance_id: 'inst-B', status: 'disconnected', qr_code: null, is_default: false,
  created_at: '2026-01-02T00:00:00.000Z',
};

const configurarSupabase = () => {
  h.from.mockImplementation(() => ({
    select: () => ({ order: h.selectOrder }),
    update: (payload: unknown) => { h.update(payload); return { eq: h.eq }; },
    delete: () => ({ eq: h.eq }),
  }));
  h.channel.mockReturnValue({ on: () => ({ subscribe: () => undefined }) });
  h.selectOrder.mockResolvedValue({ data: [A, B], error: null });
  h.eq.mockResolvedValue({ error: null });
};

async function mount() {
  const r = renderHook(() => useConnectionsManager());
  await act(async () => { await Promise.resolve(); });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  configurarSupabase();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('handleDisconnect', () => {
  it('desconecta na Evolution e marca a linha local como disconnected', async () => {
    h.disconnectInstance.mockResolvedValueOnce({ ok: true });
    const r = await mount();

    await act(async () => { await r.result.current.handleDisconnect(A); });

    expect(h.disconnectInstance).toHaveBeenCalledWith('inst-A');
    expect(h.update).toHaveBeenCalledWith({ status: 'disconnected', qr_code: null });
    expect(h.eq).toHaveBeenCalledWith('id', 'A');
    expect(h.toast).not.toHaveBeenCalled();
    // Mutação que prova este teste: remover a linha 294 do hook (o update local)
    // deixa o estado como 'disconnected' no banco → o expect acima falha.
  });

  it('não faz nada quando a conexão não tem instância', async () => {
    const r = await mount();

    await act(async () => { await r.result.current.handleDisconnect({ ...A, instance_id: null }); });

    expect(h.disconnectInstance).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('quando a Evolution falha, avisa e NÃO marca a linha como desconectada', async () => {
    h.disconnectInstance.mockRejectedValueOnce(new Error('GO recusou'));
    const r = await mount();

    await act(async () => { await r.result.current.handleDisconnect(A); });

    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao desconectar', description: 'GO recusou', variant: 'destructive' }),
    );
  });
});

describe('handleAddConnection', () => {
  it('recusa criar sem nome e telefone, sem chamar a Evolution', async () => {
    const r = await mount();

    await act(async () => { await r.result.current.handleAddConnection(); });

    expect(h.createConnection).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith({
      title: 'Erro', description: 'Preencha o nome e o número do telefone.', variant: 'destructive',
    });
  });

  it('cria com nome de instância derivado do nome, fecha o diálogo e abre o QR da conexão criada', async () => {
    const nova: WhatsAppConnection = { ...A, id: 'C', name: 'Nova', instance_id: 'inst-C', is_default: false };
    h.createConnection.mockResolvedValueOnce({ connection: nova });
    h.connectInstance.mockResolvedValueOnce({ qrcode: { base64: 'QR-C' } });
    const r = await mount();

    await act(async () => { r.result.current.setNewConnection({ name: 'Nova Loja', phone_number: '5511900000009' }); });
    await act(async () => { await r.result.current.handleAddConnection(); });
    await act(async () => { await Promise.resolve(); });

    const arg = h.createConnection.mock.calls[0][0];
    expect(arg.name).toBe('Nova Loja');
    expect(arg.phone_number).toBe('5511900000009');
    expect(arg.instanceName).toMatch(/^nova_loja_[0-9]{6}$/);
    expect(arg.is_default).toBe(false);
    expect(r.result.current.isAddDialogOpen).toBe(false);
    expect(r.result.current.newConnection).toEqual({ name: '', phone_number: '' });
    // O handler encadeia o QR da conexão recém-criada (não deixa o operador sem passo seguinte).
    expect(h.connectInstance).toHaveBeenCalledWith('inst-C');
    expect(r.result.current.qrCodeDialog.open).toBe(true);
    expect(r.result.current.qrCodeDialog.connectionId).toBe('C');
    expect(r.result.current.qrCodeDialog.status).toBe('pending');
    expect(r.result.current.qrCodeDialog.qrCode).toBe('QR-C');
  });

  it('marca como padrão somente quando não há nenhuma outra conexão', async () => {
    h.selectOrder.mockResolvedValue({ data: [], error: null });
    const nova: WhatsAppConnection = { ...A, id: 'C', name: 'Primeira', instance_id: 'inst-C' };
    h.createConnection.mockResolvedValueOnce({ connection: nova });
    h.connectInstance.mockResolvedValueOnce({ qrcode: { base64: 'QR-C' } });
    const r = await mount();

    await act(async () => { r.result.current.setNewConnection({ name: 'Primeira', phone_number: '5511900000009' }); });
    await act(async () => { await r.result.current.handleAddConnection(); });

    expect(h.createConnection.mock.calls[0][0].is_default).toBe(true);
  });

  it('quando a criação falha, mostra o motivo e libera o botão (isCreating volta a false)', async () => {
    h.createConnection.mockRejectedValueOnce(new Error('GO fora do ar'));
    const r = await mount();

    await act(async () => { r.result.current.setNewConnection({ name: 'X', phone_number: '1' }); });
    await act(async () => { await r.result.current.handleAddConnection(); });

    expect(r.result.current.isCreating).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao criar conexão', description: 'GO fora do ar', variant: 'destructive' }),
    );
  });
});

describe('handleShowQrCode', () => {
  it('recusa conexão sem instância, sem chamar a Evolution', async () => {
    const r = await mount();

    await act(async () => { await r.result.current.handleShowQrCode({ ...A, instance_id: null }); });

    expect(h.connectInstance).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro', variant: 'destructive' }),
    );
  });

  it('faz polling de 3 em 3 s e vira "connected" quando a sessão abre, parando o polling', async () => {
    vi.useFakeTimers();
    h.connectInstance.mockResolvedValueOnce({ qrcode: { base64: 'QR-A' } });
    h.getInstanceStatus
      .mockResolvedValueOnce({ state: 'close' })
      .mockResolvedValueOnce({ state: 'open' })
      .mockResolvedValue({ state: 'open' });
    const r = await mount();

    await act(async () => { await r.result.current.handleShowQrCode(A); });
    expect(r.result.current.qrCodeDialog.status).toBe('pending');

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(h.getInstanceStatus).toHaveBeenCalledTimes(1);
    // Consulta a instância certa (o `instance_id`, não o `id` da linha): é o
    // que o provedor entende; passar o id da linha deixaria o diálogo preso em
    // 'pending' e ninguém veria o QR.
    expect(h.getInstanceStatus).toHaveBeenCalledWith('inst-A');
    expect(r.result.current.qrCodeDialog.status).toBe('pending');

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(r.result.current.qrCodeDialog.status).toBe('connected');
    expect(r.result.current.qrCodeDialog.qrCode).toBeNull();
    expect(h.toast).toHaveBeenCalledWith({ title: 'Conectado!', description: 'WhatsApp conectado com sucesso.' });

    // Sessão conectada encerra o polling: nada mais é consultado depois.
    h.getInstanceStatus.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(h.getInstanceStatus).not.toHaveBeenCalled();
    // Mutação que prova este teste: trocar `result?.state === 'open'` por um valor
    // que nunca casa (linha 206) deixa o diálogo preso em 'pending' → falha.
  });

  it('rede de segurança: 30 s sem QR nem conexão caem para "error" com o botão de novo código', async () => {
    vi.useFakeTimers();
    h.connectInstance.mockReturnValue(new Promise(() => undefined));
    const r = await mount();

    await act(async () => { void r.result.current.handleShowQrCode(A); });
    await act(async () => { await Promise.resolve(); });
    expect(r.result.current.qrCodeDialog.status).toBe('loading');

    await act(async () => { await vi.advanceTimersByTimeAsync(29999); });
    expect(r.result.current.qrCodeDialog.status).toBe('loading');

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(r.result.current.qrCodeDialog.status).toBe('error');
    expect(r.result.current.qrCodeDialog.errorMessage).toContain('Gerar novo código');
    // Mutação que prova este teste: mudar os 30000 ms do efeito (linha 80) para
    // 60000 deixa o diálogo em 'loading' no disparo → falha.
  });
});
