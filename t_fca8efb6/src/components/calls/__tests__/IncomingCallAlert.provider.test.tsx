import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, act } from '@testing-library/react';

const {
  mockAccept,
  mockReject,
  mockAnswerCall,
  mockMissCall,
  mockDismissCall,
  mockPersistir,
  mockAbrirConversa,
  estado,
} = vi.hoisted(() => ({
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  mockAnswerCall: vi.fn(),
  mockMissCall: vi.fn(),
  mockDismissCall: vi.fn(),
  mockPersistir: vi.fn(),
  mockAbrirConversa: vi.fn(),
  estado: { incomingCall: null as null | Record<string, unknown> },
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

// Legado: o alerta NÃO pode mais escrever desfecho direto na tabela `calls`.
vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ answerCall: mockAnswerCall, missCall: mockMissCall }),
}));

// A MÁQUINA da sessão é quem decide o desfecho do VoIP (`reject()` → `declined`).
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({ accept: mockAccept, reject: mockReject }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true },
    whatsapp: {
      channel: 'whatsapp',
      canDial: false,
      canReceive: true,
      canRecord: false,
      canReject: false,
      reason: 'whatsapp_no_outbound',
    },
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
}));

// R2-CALL-007: o canal WhatsApp não fala com o banco pelo alerta — quem grava é
// o adapter, pelas portas dubladas abaixo. O resto do módulo de persistência
// (regras puras de desfecho) fica real.
vi.mock('@/lib/calls/persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/calls/persistence')>();
  return { ...real, upsertMyCall: mockPersistir };
});

vi.mock('@/components/catalog/useSendProduct', () => ({
  openContactChat: mockAbrirConversa,
}));

import { IncomingCallAlert } from '../IncomingCallAlert';

/** Chamada de VoIP: quem atende/recusa é a máquina da sessão (SIP). */
const CHAMADA_VOIP = {
  id: 'n1',
  callId: 'k1',
  contact_id: 'c1',
  contact_name: 'Fulano de Tal',
  contact_phone: '+55 11 99999-0000',
  is_video: false,
  whatsapp_connection_id: null,
  started_at: '2026-09-30T00:00:00Z',
};

/** Notificação de WhatsApp: o canal executa o contrato local dele (T24). */
const NOTIFICACAO_WHATSAPP = { ...CHAMADA_VOIP, whatsapp_connection_id: 'w1' };

describe('IncomingCallAlert — fiação ao provider da sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.incomingCall = CHAMADA_VOIP;
    mockPersistir.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('VoIP: Atender chama accept() da máquina da sessão e NÃO chama mais o legado answerCall', () => {
    render(<IncomingCallAlert />);
    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAnswerCall).not.toHaveBeenCalled();
  });

  it('VoIP: o segundo botão é "Recusar" e chama reject() da máquina da sessão, sem missCall', () => {
    render(<IncomingCallAlert />);

    expect(screen.queryByRole('button', { name: /ignorar/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /recusar/i }));

    expect(mockReject).toHaveBeenCalledTimes(1);
    expect(mockMissCall).not.toHaveBeenCalled();
    expect(mockDismissCall).toHaveBeenCalledTimes(1);
  });

  it('WhatsApp: o botão é "Ignorar" (D7=b) e a ação vai pelo canal local, não pelo SIP', () => {
    estado.incomingCall = NOTIFICACAO_WHATSAPP;
    render(<IncomingCallAlert />);

    // A chamada deste cenário tem `whatsapp_connection_id`, então o canal é
    // WhatsApp e o rótulo do segundo botão é o de ignorar (T24/D7) — e não
    // "Recusar". É a prova direta de que o componente leu o canal do chamado.
    expect(screen.queryByRole('button', { name: /recusar/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ignorar/i }));

    // Quem recusa é o contrato local do canal (R2-CALL-007): nada de SIP.
    expect(mockPersistir).toHaveBeenCalledTimes(1);
    expect(mockReject).not.toHaveBeenCalled();
    expect(mockMissCall).not.toHaveBeenCalled();
    // Ignorar só silencia o PRÓPRIO alerta; o desfecho (declined) é do canal.
    expect(mockDismissCall).toHaveBeenCalledTimes(1);
  });

  it('não decide desfecho por tempo — nenhum setTimeout(30000) no componente', () => {
    vi.useFakeTimers();
    render(<IncomingCallAlert />);

    act(() => { vi.advanceTimersByTime(30000); });
    act(() => { vi.advanceTimersByTime(60000); });

    // Nem atende, nem recusa, nem some sozinho: o relógio é da máquina, não da UI.
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
    expect(mockAnswerCall).not.toHaveBeenCalled();
    expect(mockMissCall).not.toHaveBeenCalled();
    expect(mockDismissCall).not.toHaveBeenCalled();

    const fonte = readFileSync(
      path.join(process.cwd(), 'src/components/calls/IncomingCallAlert.tsx'),
      'utf8',
    );
    expect(fonte).not.toContain('setTimeout');
    // A âncora de separação alerta/mídia continua pinada.
    expect(fonte).toContain('ÂNCORA (não unificar)');
  });
});
