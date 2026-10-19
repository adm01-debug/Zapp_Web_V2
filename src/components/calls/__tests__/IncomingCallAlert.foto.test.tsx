import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Foto do contato no alerta de chamada recebida (paridade V3): com foto,
// sem foto e foto que não carrega. O componente RENDERIZADO é o real
// (`../IncomingCallAlert`); o que é dublado é a fronteira de dados (o listener
// que entrega a notificação e o client do Supabase que devolve o contato).

const { estado, mockDismissCall, mockFrom, contato } = vi.hoisted(() => ({
  estado: { incomingCall: null as null | Record<string, unknown> },
  mockDismissCall: vi.fn(),
  mockFrom: vi.fn(),
  contato: { data: null as { avatar_url: string | null } | null, error: null as { message: string } | null },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: unknown }) => <div {...rest}>{children as never}</div>,
  },
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));

vi.mock('../CallDialog', () => ({ CallDialog: () => null }));

vi.mock('@/hooks/communication/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({
    incomingCall: estado.incomingCall,
    dismissCall: mockDismissCall,
  }),
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    accept: vi.fn(),
    reject: vi.fn(),
    session: { status: 'ringing_in', sessionId: 'k1', answeredAt: null },
  }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false },
  }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, soundVolume: 70 },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/lib/calls/persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/calls/persistence')>();
  return { ...real, upsertMyCall: vi.fn() };
});

vi.mock('@/components/catalog/useSendProduct', () => ({
  openContactChat: vi.fn(),
}));

// O realtime do término remoto abre canal; o transporte é dublado (nenhum byte
// sai para a rede) e `from` é o caminho da foto do contato.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

import { IncomingCallAlert } from '../IncomingCallAlert';

const CHAMADA = {
  id: 'n1',
  callId: 'k1',
  contact_id: 'c1',
  contact_name: 'Fulano de Tal',
  contact_phone: '+55 11 99999-0000',
  is_video: false,
  whatsapp_connection_id: null,
  started_at: '2026-09-30T00:00:00Z',
};

/** Resposta do banco para a leitura da foto (`contacts.avatar_url`). */
function bancoRespondeAvatar(avatarUrl: string | null) {
  contato.data = avatarUrl === null ? null : { avatar_url: avatarUrl };
  contato.error = null;
}

describe('IncomingCallAlert — foto do contato que está ligando', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.incomingCall = CHAMADA;
    bancoRespondeAvatar(null);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn(() => Promise.resolve({ data: contato.data, error: contato.error })),
        }),
      }),
    });
  });

  it('mostra a foto quando o contato tem uma', async () => {
    bancoRespondeAvatar('https://cdn.exemplo/foto-do-fulano.jpg');
    render(<IncomingCallAlert />);

    const foto = await screen.findByTestId('foto-do-contato');
    expect(foto).toHaveAttribute('src', 'https://cdn.exemplo/foto-do-fulano.jpg');
    // Decorativa: `alt` vazio, porque o nome já é lido ao lado.
    expect(foto).toHaveAttribute('alt', '');
    expect(screen.queryByText('FD')).toBeNull();
    // A foto vem do contato da própria chamada, não de um terceiro.
    expect(mockFrom).toHaveBeenCalledWith('contacts');
  });

  it('cai nas iniciais quando o contato não tem foto', async () => {
    render(<IncomingCallAlert />);

    expect(await screen.findByText('FD')).toBeTruthy();
    expect(screen.queryByTestId('foto-do-contato')).toBeNull();
  });

  it('cai nas iniciais quando a foto não carrega (imagem quebrada)', async () => {
    bancoRespondeAvatar('https://cdn.exemplo/foto-inexistente.jpg');
    render(<IncomingCallAlert />);

    const foto = await screen.findByTestId('foto-do-contato');
    fireEvent.error(foto);

    await waitFor(() => {
      expect(screen.queryByTestId('foto-do-contato')).toBeNull();
    });
    expect(screen.getByText('FD')).toBeTruthy();
  });
});
