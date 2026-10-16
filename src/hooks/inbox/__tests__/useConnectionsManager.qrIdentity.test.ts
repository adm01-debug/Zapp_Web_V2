import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// R2-API-039 / item 213 do BACKLOG_VERIFICADO:
//   "Resposta e polling antigos misturam identidades no diálogo de QR Code".
// Corrida A → fechar → B: a resposta atrasada de connectInstance(A) e o tick
// atrasado do polling de A NÃO podem cair sob o connectionId/QR/status de B,
// e fechar o diálogo não pode deixar polling zumbi da outra geração.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  connectInstance: vi.fn(),
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
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: (...args: unknown[]) => mocks.connectInstance(...args),
    getInstanceStatus: (...args: unknown[]) => mocks.getInstanceStatus(...args),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

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

const B: WhatsAppConnection = {
  ...A,
  id: 'B',
  name: 'Conexão B',
  phone_number: '5511888888888',
  instance_id: 'inst-B',
  is_default: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [A, B], error: null });
  mocks.from.mockImplementation(() => ({ select: mocks.select }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.connectInstance.mockResolvedValue({});
  mocks.getInstanceStatus.mockResolvedValue({ state: 'close' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useConnectionsManager diálogo de QR (R2-API-039)', () => {
  it('não exibe o QR de A no diálogo de B quando a resposta de A chega depois da troca', async () => {
    const qrA = deferred<{ qrcode?: { base64: string } }>();
    mocks.connectInstance.mockImplementation((instance: string) =>
      instance === 'inst-A' ? qrA.promise : Promise.resolve({ qrcode: { base64: 'QR-B' } }));

    const result = await mount();

    // Abre A: connect fica pendente.
    await act(async () => {
      void result.current.handleShowQrCode(A);
      await Promise.resolve();
    });
    expect(result.current.qrCodeDialog.connectionId).toBe('A');

    // Operador fecha e abre B antes da resposta de A.
    await act(async () => { result.current.closeQrDialog(); });
    await act(async () => { await result.current.handleShowQrCode(B); });
    expect(result.current.qrCodeDialog.connectionId).toBe('B');
    expect(result.current.qrCodeDialog.qrCode).toBe('QR-B');

    // Resposta atrasada de A chega agora.
    await act(async () => {
      qrA.resolve({ qrcode: { base64: 'QR-A' } });
      await Promise.resolve();
    });

    expect(result.current.qrCodeDialog.connectionId).toBe('B');
    expect(result.current.qrCodeDialog.qrCode).not.toBe('QR-A');
  });

  it('status open de A não marca o diálogo de B como conectado', async () => {
    vi.useFakeTimers();
    const statusA = deferred<{ state: string }>();
    mocks.connectInstance.mockImplementation((instance: string) =>
      Promise.resolve({ qrcode: { base64: instance === 'inst-A' ? 'QR-A' : 'QR-B' } }));
    mocks.getInstanceStatus.mockImplementation((instance: string) =>
      instance === 'inst-A' ? statusA.promise : Promise.resolve({ state: 'close' }));

    const result = await mount();

    // A gera QR e o primeiro tick do polling de A fica pendente.
    await act(async () => { await result.current.handleShowQrCode(A); });
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(mocks.getInstanceStatus).toHaveBeenCalledWith('inst-A');

    // Troca para B antes da resposta de status de A.
    await act(async () => { await result.current.handleShowQrCode(B); });
    expect(result.current.qrCodeDialog.connectionId).toBe('B');

    // Resposta atrasada do polling de A: instância A está open.
    await act(async () => {
      statusA.resolve({ state: 'open' });
      await Promise.resolve();
    });

    expect(result.current.qrCodeDialog.connectionId).toBe('B');
    expect(result.current.qrCodeDialog.status).not.toBe('connected');
    expect(result.current.qrCodeDialog.qrCode).toBe('QR-B');
  });

  it('não deixa polling zumbi após fechar o diálogo (A → B → fechar)', async () => {
    vi.useFakeTimers();
    const statusA = deferred<{ state: string }>();
    mocks.connectInstance.mockImplementation((instance: string) =>
      Promise.resolve({ qrcode: { base64: instance === 'inst-A' ? 'QR-A' : 'QR-B' } }));
    mocks.getInstanceStatus.mockImplementation((instance: string) =>
      instance === 'inst-A' ? statusA.promise : Promise.resolve({ state: 'close' }));

    const result = await mount();

    await act(async () => { await result.current.handleShowQrCode(A); });
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });

    await act(async () => { await result.current.handleShowQrCode(B); });
    // Status atrasado de A: no código com defeito ele anula a referência do
    // timer de B, e B fica sem cancelamento.
    await act(async () => {
      statusA.resolve({ state: 'open' });
      await Promise.resolve();
    });

    await act(async () => { result.current.closeQrDialog(); });
    expect(result.current.qrCodeDialog.open).toBe(false);

    mocks.getInstanceStatus.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(9000);
      await Promise.resolve();
    });
    expect(mocks.getInstanceStatus).not.toHaveBeenCalled();
  });
});
