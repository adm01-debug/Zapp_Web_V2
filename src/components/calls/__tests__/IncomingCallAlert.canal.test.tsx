/**
 * R2-CALL-007 — "Atender e ignorar alerta WhatsApp usam comandos SIP sem
 * identidade da notificação".
 *
 * O defeito medido: o alerta escolhia o rótulo/capacidade pelo canal, mas os
 * handlers chamavam `accept()`/`reject()` do provider de sessão SEM canal e SEM
 * identidade — e o provider sempre fala com o SIP (`sip.acceptIncomingCall` /
 * `sip.rejectIncomingCall`). Com uma notificação de WhatsApp B na tela e uma
 * sessão SIP A tocando/ativa, o clique em B mexia em A.
 *
 * Este teste prova o contrato correto:
 *  - canal WhatsApp → SÓ o contrato local do canal (adapter: grava o desfecho +
 *    abre a conversa), pelo id da notificação; NENHUM comando SIP sai daqui;
 *  - canal VoIP → o provider de sessão continua sendo quem atende/recusa;
 *  - o estado "atendido" (diálogo) só abre com resultado válido da operação.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const {
  mockAccept,
  mockReject,
  mockDismissCall,
  mockPersistir,
  mockAbrirConversa,
  estado,
} = vi.hoisted(() => ({
  // `accept`/`reject` do provider = o caminho SIP. Neste teste eles são o
  // "SIP A": se forem chamados pelo alerta de WhatsApp B, o defeito voltou.
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  mockDismissCall: vi.fn(),
  mockPersistir: vi.fn(),
  mockAbrirConversa: vi.fn(),
  estado: {
    incomingCall: null as null | Record<string, unknown>,
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

vi.mock('@/hooks/communication/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({
    incomingCall: estado.incomingCall,
    dismissCall: mockDismissCall,
  }),
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    accept: mockAccept,
    reject: mockReject,
    // R2-CALL-006: o alerta lê o estado terminal do provedor. Aqui a sessão fica
    // neutra (`idle`, sem linha) — a notificação de WhatsApp não roda no SIP e o
    // aceite de VoIP é dublado; nenhum dos casos deste teste deve encerrar sozinho.
    session: { status: 'idle', sessionId: null, answeredAt: null },
  }),
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

// O término remoto (R2-CALL-008) é outro cartão: aqui ele entra como no-op para
// este teste não abrir canal de Realtime de verdade.
vi.mock('@/hooks/calls/useTerminoRemoto', () => ({ useTerminoRemoto: vi.fn() }));

// As duas portas de I/O do contrato local do WhatsApp entram como dublês: o
// alerta NÃO pode falar com o banco nem com o inbox por conta própria. O resto
// do módulo (as regras puras de desfecho, que o adapter usa) fica real.
vi.mock('@/lib/calls/persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/calls/persistence')>();
  return { ...real, upsertMyCall: mockPersistir };
});

vi.mock('@/components/catalog/useSendProduct', () => ({
  openContactChat: mockAbrirConversa,
}));

import { IncomingCallAlert } from '../IncomingCallAlert';

/** Notificação de WhatsApp (canal sem linha SIP que a atenda). */
const NOTIFICACAO_WHATSAPP = {
  id: 'notif-wa-1',
  callId: 'call-wa-1',
  contact_id: 'contato-42',
  contact_name: 'Cliente WhatsApp',
  contact_phone: '+55 11 98888-7777',
  is_video: false,
  whatsapp_connection_id: 'w1',
  started_at: '2026-09-30T00:00:00Z',
};

/** Chamada de VoIP: quem atende/recusa é a máquina da sessão (SIP). */
const NOTIFICACAO_VOIP = {
  ...NOTIFICACAO_WHATSAPP,
  id: 'notif-sip-1',
  callId: 'call-sip-1',
  whatsapp_connection_id: null,
};

describe('IncomingCallAlert — ação encaminhada pelo canal e pela identidade (R2-CALL-007)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.incomingCall = NOTIFICACAO_WHATSAPP;
    mockPersistir.mockResolvedValue({ ok: true });
  });

  it('WhatsApp + Atender: usa o contrato local da notificação B e NÃO toca no SIP de A', async () => {
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    await waitFor(() => expect(mockPersistir).toHaveBeenCalledTimes(1));
    const payload = mockPersistir.mock.calls[0][0] as Record<string, unknown>;
    // Identidade da NOTIFICAÇÃO (B), não da sessão corrente.
    expect(payload.id).toBe('call-wa-1');
    expect(payload.contactId).toBe('contato-42');
    expect(payload.channel).toBe('whatsapp');
    // O fluxo local documentado do canal: marca atendida e abre a conversa.
    expect(payload.status).toBe('answered');
    expect(payload.answeredAt).toEqual(expect.any(String));
    expect(mockAbrirConversa).toHaveBeenCalledWith('contato-42');

    // Nenhum comando SIP: a sessão A (accept/reject do provider) fica intacta.
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('WhatsApp + Ignorar: grava declined local pelo id da notificação e NÃO recusa no SIP', async () => {
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /ignorar/i }));

    await waitFor(() => expect(mockPersistir).toHaveBeenCalledTimes(1));
    const payload = mockPersistir.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('call-wa-1');
    expect(payload.channel).toBe('whatsapp');
    expect(payload.status).toBe('declined');
    expect(payload.endReason).toBe('declined');
    // Ignorar silencia o PRÓPRIO alerta; o desfecho é do contrato do canal.
    expect(mockDismissCall).toHaveBeenCalledTimes(1);

    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('abre o estado atendido só com resultado válido da gravação local', async () => {
    mockPersistir.mockResolvedValue({ ok: false, error: 'rpc fora' });
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    await waitFor(() => expect(mockPersistir).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('call-dialog')).toBeNull();
  });

  it('com resultado válido, o alerta vira o diálogo atendido', async () => {
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    await waitFor(() => expect(screen.getByTestId('call-dialog')).toBeTruthy());
  });

  it('VoIP continua na máquina da sessão: Recusar chama o provider e não o canal WhatsApp', async () => {
    estado.incomingCall = NOTIFICACAO_VOIP;
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /recusar/i }));

    await waitFor(() => expect(mockReject).toHaveBeenCalledTimes(1));
    expect(mockPersistir).not.toHaveBeenCalled();
    expect(mockAbrirConversa).not.toHaveBeenCalled();
  });

  it('VoIP continua na máquina da sessão: Atender chama o provider e não o canal WhatsApp', async () => {
    estado.incomingCall = NOTIFICACAO_VOIP;
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByRole('button', { name: /atender/i }));

    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    expect(mockPersistir).not.toHaveBeenCalled();
    expect(mockAbrirConversa).not.toHaveBeenCalled();
  });
});
