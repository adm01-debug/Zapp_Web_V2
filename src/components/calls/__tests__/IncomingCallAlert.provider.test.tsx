import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { mockAccept, mockReject, mockAnswerCall, mockMissCall, mockDismissCall } = vi.hoisted(() => ({
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  mockAnswerCall: vi.fn(),
  mockMissCall: vi.fn(),
  mockDismissCall: vi.fn(),
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
    incomingCall: {
      id: 'n1',
      callId: 'k1',
      contact_id: 'c1',
      contact_name: 'Fulano de Tal',
      contact_phone: '+55 11 99999-0000',
      is_video: false,
      whatsapp_connection_id: 'w1',
      started_at: '2026-09-30T00:00:00Z',
    },
    dismissCall: mockDismissCall,
  }),
}));

// Legado: o alerta NÃO pode mais escrever desfecho direto na tabela `calls`.
vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ answerCall: mockAnswerCall, missCall: mockMissCall }),
}));

// A MÁQUINA da sessão é quem decide o desfecho (`reject()` → `declined`).
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({ accept: mockAccept, reject: mockReject }),
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

import { IncomingCallAlert } from '../IncomingCallAlert';

describe('IncomingCallAlert — fiação ao provider da sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Atender chama accept() do provider e NÃO chama mais o legado answerCall', () => {
    render(<IncomingCallAlert />);
    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAnswerCall).not.toHaveBeenCalled();
  });

  it('Recusar chama reject() do provider e NÃO chama mais missCall', () => {
    render(<IncomingCallAlert />);
    fireEvent.click(screen.getByRole('button', { name: /recusar/i }));

    expect(mockReject).toHaveBeenCalledTimes(1);
    expect(mockMissCall).not.toHaveBeenCalled();
    // Recusar só silencia o PRÓPRIO alerta; o desfecho (declined) é do provider.
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
