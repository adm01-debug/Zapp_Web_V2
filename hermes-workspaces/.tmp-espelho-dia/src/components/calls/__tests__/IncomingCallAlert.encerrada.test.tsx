/**
 * R2-CALL-006 (#282) — "Alerta recebido conserva a notificação encerrada e o
 * diálogo da chamada anterior".
 *
 * São dois vazamentos de estado do MESMO componente (`IncomingCallAlert`):
 *
 *  1. o alerta não acompanhava o estado terminal do PROVEDOR: encerrada a
 *     chamada que ainda tocava, a notificação (e o toque, alto) continuavam em
 *     cena — o listener só solta a notificação no dismiss do agente;
 *  2. `showDialog` era um booleano solto: sobrevivia ao fim da notificação e a
 *     ligação SEGUINTE abria direto no diálogo da anterior, já com
 *     `initialStatus="answered"`, sem nunca ter tocado.
 *
 * O contrato provado aqui: o estado "atendido" vale para a CHAMADA atendida
 * enquanto ela é a notificação em cena, e o alerta sai de cena quando o provedor
 * encerra a MESMA chamada sem atendimento — sem tocar em outra sessão nem no
 * diálogo de uma chamada já atendida.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const { mockAccept, mockReject, controle } = vi.hoisted(() => ({
  // `accept`/`reject` do provedor: o caminho SIP de uma chamada de VoIP.
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  controle: {
    /** Notificação em cena (o que o listener entrega). */
    notificacao: null as Record<string, unknown> | null,
    /** Estado da máquina de sessão publicado pelo provedor. */
    sessao: {
      status: 'idle' as string,
      sessionId: null as string | null,
      answeredAt: null as number | null,
    },
    /** Preenchidos pelos dublês dos hooks, no primeiro render. */
    publicarNotificacao: (_n: Record<string, unknown> | null) => {},
    publicarSessao: (
      _s: Partial<{ status: string; sessionId: string | null; answeredAt: number | null }>,
    ) => {},
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: unknown }) => <div {...rest}>{children as never}</div>,
  },
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));

// Probe do diálogo: a prova de que o alerta abriu o estado "atendido".
vi.mock('../CallDialog', () => ({
  CallDialog: () => <div data-testid="call-dialog" />,
}));

// O término remoto (R2-CALL-008) é outro cartão: aqui entra como no-op para este
// teste não abrir canal de Realtime de verdade.
vi.mock('@/hooks/calls/useTerminoRemoto', () => ({ useTerminoRemoto: vi.fn() }));

/**
 * O listener real guarda a notificação em estado e a solta no `dismissCall`. O
 * dublê faz o MESMO — mudar a notificação em cena re-renderiza como no produto —
 * para o teste julgar a TELA, e não só a chamada do handler.
 */
vi.mock('@/hooks/communication/useIncomingCallListener', async () => {
  const { useState } = await import('react');
  return {
    useIncomingCallListener: () => {
      const [incomingCall, setIncomingCall] = useState(controle.notificacao);
      controle.publicarNotificacao = setIncomingCall;
      return { incomingCall, dismissCall: () => setIncomingCall(null) };
    },
  };
});

/** A máquina da sessão, com o estado que o provedor publica para o alerta. */
vi.mock('@/providers/CallSessionProvider', async () => {
  const { useState } = await import('react');
  return {
    useCallSession: () => {
      const [session, setSession] = useState(controle.sessao);
      controle.publicarSessao = (patch) => setSession((atual) => ({ ...atual, ...patch }));
      return { accept: mockAccept, reject: mockReject, session };
    },
  };
});

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

// As portas de I/O do contrato local do canal entram como dublês: o alerta não
// pode falar com o banco nem com o inbox por conta própria.
vi.mock('@/lib/calls/persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/calls/persistence')>();
  return { ...real, upsertMyCall: vi.fn() };
});

vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: vi.fn() }));

import { IncomingCallAlert } from '../IncomingCallAlert';

/** Chamada de VoIP: quem atende/recusa é a máquina da sessão (SIP). */
const CHAMADA_A = {
  id: 'notif-a',
  callId: 'call-a',
  contact_id: 'contato-a',
  contact_name: 'Fulano de Tal',
  contact_phone: '+55 11 99999-0000',
  is_video: false,
  whatsapp_connection_id: null,
  started_at: '2026-10-06T12:00:00Z',
};

/** A ligação seguinte, com identidade própria. */
const CHAMADA_B = {
  ...CHAMADA_A,
  id: 'notif-b',
  callId: 'call-b',
  contact_id: 'contato-b',
  contact_name: 'Beltrano da Silva',
  contact_phone: '+55 11 98888-7777',
};

describe('IncomingCallAlert — o alerta segue a chamada, não a tela (R2-CALL-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controle.notificacao = CHAMADA_A;
    controle.sessao = { status: 'idle', sessionId: null, answeredAt: null };
  });

  it('encerrada a chamada que ainda tocava, o alerta sai de cena (não conserva a notificação)', async () => {
    render(<IncomingCallAlert />);
    expect(screen.getByText('Fulano de Tal')).toBeTruthy();

    // O outro lado desliga enquanto o alerta toca: o provedor fecha a MESMA
    // linha de `calls` (`sessionId` = callId do alerta) sem atendimento.
    act(() => {
      controle.publicarSessao({ status: 'ended', sessionId: 'call-a', answeredAt: null });
    });

    // A notificação é solta pelo listener (`dismissCall`) e o alerta some.
    await waitFor(() => expect(screen.queryByText('Fulano de Tal')).toBeNull());
  });

  it('a ligação seguinte não abre no diálogo da anterior', async () => {
    render(<IncomingCallAlert />);

    // A chamada A é atendida: o alerta vira o diálogo "atendido" dela.
    fireEvent.click(screen.getByRole('button', { name: /atender/i }));
    await waitFor(() => expect(screen.getByTestId('call-dialog')).toBeTruthy());

    // A notificação de A sai de cena e chega a ligação B.
    act(() => {
      controle.publicarNotificacao(CHAMADA_B);
    });

    // B toca de novo: o estado atendido era do chamado A e não vale para B.
    expect(screen.queryByTestId('call-dialog')).toBeNull();
    expect(screen.getByText('Beltrano da Silva')).toBeTruthy();
    expect(screen.getByRole('button', { name: /atender/i })).toBeTruthy();
  });

  it('encerrada a chamada ATENDIDA, quem fecha o diálogo é o diálogo (não o alerta)', async () => {
    render(<IncomingCallAlert />);
    fireEvent.click(screen.getByRole('button', { name: /atender/i }));
    await waitFor(() => expect(screen.getByTestId('call-dialog')).toBeTruthy());

    // Chamada já atendida: o diálogo mostra o desfecho e o agente encerra.
    act(() => {
      controle.publicarSessao({ status: 'ended', sessionId: 'call-a', answeredAt: Date.now() });
    });

    expect(screen.getByTestId('call-dialog')).toBeTruthy();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('o encerramento de OUTRA sessão não derruba este alerta', () => {
    render(<IncomingCallAlert />);

    act(() => {
      controle.publicarSessao({ status: 'ended', sessionId: 'call-de-outro-agente', answeredAt: null });
    });

    expect(screen.getByText('Fulano de Tal')).toBeTruthy();
    expect(screen.getByRole('button', { name: /atender/i })).toBeTruthy();
  });
});
