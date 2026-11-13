import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// 13/11 — QR quebrado em produção: a Edge passou a responder a credencial da
// instância recusada/ausente com `code` (instance_token_invalid/_missing). O
// diálogo guarda esse código (é o que faz a tela oferecer "Sincronizar
// credencial") e o botão chama sync-instance-token e gera o QR de novo.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  connectInstance: vi.fn(),
  syncInstanceToken: vi.fn(),
  getInstanceStatus: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
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
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: (...args: unknown[]) => mocks.connectInstance(...args),
    syncInstanceToken: (...args: unknown[]) => mocks.syncInstanceToken(...args),
    getInstanceStatus: (...args: unknown[]) => mocks.getInstanceStatus(...args),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

import { INSTANCE_TOKEN_ERROR_CODES, useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const A: WhatsAppConnection = {
  id: 'A',
  name: 'Conexão A',
  phone_number: '5511999999999',
  instance_id: 'inst-A',
  status: 'disconnected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-05T00:00:00.000Z',
};

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return result;
}

const credencialRecusada = () => Object.assign(
  new Error("Credencial da instância 'inst-A' inválida no servidor WhatsApp (401)."),
  { code: 'instance_token_invalid', apiStatus: 401 },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [A], error: null });
  mocks.from.mockImplementation(() => ({ select: mocks.select }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.getInstanceStatus.mockResolvedValue({ state: 'close' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useConnectionsManager — credencial da instância (13/11)', () => {
  it('guarda o code do erro da Edge no diálogo', async () => {
    mocks.connectInstance.mockRejectedValue(credencialRecusada());
    const result = await mount();
    await act(async () => { await result.current.handleShowQrCode(A); });
    expect(result.current.qrCodeDialog.status).toBe('error');
    expect(result.current.qrCodeDialog.errorCode).toBe('instance_token_invalid');
    expect(INSTANCE_TOKEN_ERROR_CODES).toContain(result.current.qrCodeDialog.errorCode);
    expect(result.current.qrCodeDialog.errorMessage).toContain('401');
  });

  it('"Sincronizar credencial" chama sync-instance-token e gera o QR de novo', async () => {
    mocks.connectInstance
      .mockRejectedValueOnce(credencialRecusada())
      .mockResolvedValueOnce({ qrcode: { base64: 'QR-NOVO' } });
    mocks.syncInstanceToken.mockResolvedValue({ ok: true, changed: true, message: 'Credencial sincronizada.' });
    const result = await mount();
    await act(async () => { await result.current.handleShowQrCode(A); });
    await act(async () => { await result.current.handleSyncCredential(); });
    expect(mocks.syncInstanceToken).toHaveBeenCalledWith('inst-A');
    expect(mocks.connectInstance).toHaveBeenCalledTimes(2);
    expect(result.current.qrCodeDialog.status).toBe('pending');
    expect(result.current.qrCodeDialog.qrCode).toBe('QR-NOVO');
    expect(result.current.qrCodeDialog.errorCode).toBeUndefined();
    expect(result.current.syncingCredential).toBe(false);
  });

  it('falha da sincronização fica no diálogo e não tenta o connect de novo', async () => {
    mocks.connectInstance.mockRejectedValue(credencialRecusada());
    mocks.syncInstanceToken.mockRejectedValue(Object.assign(
      new Error("A instância 'inst-A' não existe no servidor WhatsApp (Evolution GO)."),
      { code: 'instance_not_found' },
    ));
    const result = await mount();
    await act(async () => { await result.current.handleShowQrCode(A); });
    await act(async () => { await result.current.handleSyncCredential(); });
    expect(mocks.connectInstance).toHaveBeenCalledTimes(1);
    expect(result.current.qrCodeDialog.status).toBe('error');
    expect(result.current.qrCodeDialog.errorCode).toBe('instance_not_found');
    expect(result.current.qrCodeDialog.errorMessage).toContain('não existe');
  });
});
