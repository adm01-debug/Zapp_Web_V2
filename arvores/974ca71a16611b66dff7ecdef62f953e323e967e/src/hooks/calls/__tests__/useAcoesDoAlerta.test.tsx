/**
 * R2-CALL-007 — `useAcoesDoAlerta`: a ação do alerta de chamada vai pelo CANAL
 * da notificação, nunca por um canal fixo.
 *
 * O hook é o código REAL sob teste, montado dentro do `CallSessionProvider`
 * real (a máquina de sessão também é a real). As fronteiras dubladas são: o
 * hook do SIP (transporte), o cliente Supabase (a RPC `upsert_my_call`), a
 * porta de abertura de conversa e o toast.
 *
 * Contratos travados:
 * - notificação nula não executa nada (nem SIP, nem banco, nem abrir conversa);
 * - VoIP executa a máquina da sessão e NÃO grava a linha aqui nem abre conversa;
 * - WhatsApp executa o contrato LOCAL do canal (grava o desfecho com
 *   `channel: 'whatsapp'` + abre a conversa) e NENHUM comando SIP sai daqui;
 * - WhatsApp sem identidade própria (sem `callId` ou sem contato) não age sobre
 *   a sessão corrente — devolve `ok: false`;
 * - falha de RLS retenta 3x e o resultado diz `ok: false` (o alerta não abre o
 *   estado "atendido");
 * - repetir a ação é idempotente: as duas gravações usam o MESMO `p_id`;
 * - os carimbos vão em UTC (ISO `Z`), o fuso do banco.
 */

import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/** Fronteiras dubladas: SIP, Supabase (RPC), abertura de conversa e toast. */
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  abrirConversa: vi.fn(),
  acceptIncomingCall: vi.fn(async () => undefined),
  rejectIncomingCall: vi.fn(async () => undefined),
  sip: {} as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));

vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: h.abrirConversa }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: () => h.sip,
}));

import { CallSessionProvider } from '@/providers/CallSessionProvider';
import { useAcoesDoAlerta } from '../useAcoesDoAlerta';
import { MENSAGEM_ATENDA_WHATSAPP } from '@/lib/calls/WhatsAppCallAdapter';
import { UPSERT_MY_CALL_RPC } from '@/lib/calls/persistence';
import type { IncomingCall } from '@/hooks/communication/useIncomingCallListener';

/** Dublê do transporte: a máquina da sessão (real) lê estes campos. */
function sipDuble() {
  return {
    sipStatus: 'registered',
    sipReason: null,
    micReason: null,
    callStatus: 'idle',
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    callDirection: null,
    currentCallId: null,
    connect: vi.fn(),
    connectWithStoredCredentials: vi.fn(),
    disconnect: vi.fn(),
    makeCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
    acceptIncomingCall: h.acceptIncomingCall,
    rejectIncomingCall: h.rejectIncomingCall,
    garantirMicrofone: vi.fn(async () => true),
  };
}

/** Notificação como o listener entrega: sem `whatsapp_connection_id` é VoIP. */
function notificacao(over: Partial<IncomingCall> = {}): IncomingCall {
  return {
    id: 'notif-1',
    callId: 'call-wa-1',
    contact_id: 'contato-42',
    contact_name: 'Cliente',
    contact_phone: '5511988887777',
    is_video: false,
    whatsapp_connection_id: null,
    started_at: '2026-03-10T11:59:00.000Z',
    ...over,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <CallSessionProvider>{children}</CallSessionProvider>
    </MemoryRouter>
  );
}

const montar = () => renderHook(() => useAcoesDoAlerta(), { wrapper: Wrapper });

/** Parâmetros da gravação entregue à RPC `upsert_my_call`. */
function gravacaoRpc(): { rpc: string; args: Record<string, unknown> } {
  expect(h.rpc).toHaveBeenCalledTimes(1);
  const [rpc, args] = h.rpc.mock.calls[0];
  return { rpc: rpc as string, args: args as Record<string, unknown> };
}

/** Nada executou: sem SIP, sem banco, sem abrir conversa. */
function nadaExecutou(): void {
  expect(h.acceptIncomingCall).not.toHaveBeenCalled();
  expect(h.rejectIncomingCall).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.abrirConversa).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rpc.mockResolvedValue({ error: null });
  h.sip = sipDuble();
});

describe('useAcoesDoAlerta — notificação ausente (R2-CALL-007)', () => {
  it('atender(null) não executa nada e devolve ok: false no canal VoIP', async () => {
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.atender>>;
    await act(async () => {
      retorno = await result.current.atender(null);
    });

    expect(retorno).toEqual({ ok: false, canal: 'voip' });
    nadaExecutou();
  });

  it('ignorar(null) não executa nada e devolve ok: false no canal VoIP', async () => {
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.ignorar>>;
    await act(async () => {
      retorno = await result.current.ignorar(null);
    });

    expect(retorno).toEqual({ ok: false, canal: 'voip' });
    nadaExecutou();
  });
});

describe('useAcoesDoAlerta — canal VoIP vai para a máquina da sessão', () => {
  it('atender executa o SIP e NÃO grava a linha nem abre conversa', async () => {
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.atender>>;
    await act(async () => {
      retorno = await result.current.atender(notificacao({ callId: 'call-voip-1' }));
    });

    expect(retorno).toEqual({ ok: true, canal: 'voip' });
    expect(h.acceptIncomingCall).toHaveBeenCalledTimes(1);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.abrirConversa).not.toHaveBeenCalled();
  });

  it('ignorar executa o SIP e devolve ok: true no canal VoIP', async () => {
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.ignorar>>;
    await act(async () => {
      retorno = await result.current.ignorar(notificacao({ callId: 'call-voip-1' }));
    });

    expect(retorno).toEqual({ ok: true, canal: 'voip' });
    expect(h.rejectIncomingCall).toHaveBeenCalledTimes(1);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.abrirConversa).not.toHaveBeenCalled();
  });
});

describe('useAcoesDoAlerta — canal WhatsApp executa o contrato local', () => {
  const whatsapp = notificacao({ whatsapp_connection_id: 'linha-wa-1' });

  it('atender grava answered no canal whatsapp, abre a conversa e NENHUM SIP sai daqui', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
    try {
      const { result } = montar();

      let retorno!: Awaited<ReturnType<typeof result.current.atender>>;
      await act(async () => {
        retorno = await result.current.atender(whatsapp);
      });

      expect(retorno).toEqual({
        ok: true,
        canal: 'whatsapp',
        mensagem: MENSAGEM_ATENDA_WHATSAPP,
      });
      const { rpc, args } = gravacaoRpc();
      expect(rpc).toBe(UPSERT_MY_CALL_RPC);
      expect(args).toMatchObject({
        p_id: 'call-wa-1',
        p_direction: 'inbound',
        p_status: 'answered',
        p_channel: 'whatsapp',
        p_contact_id: 'contato-42',
        p_peer_number: '5511988887777',
        p_peer_name: 'Cliente',
        p_answered_at: '2026-03-10T12:00:00.000Z',
      });
      expect(h.abrirConversa).toHaveBeenCalledWith('contato-42');
      expect(h.acceptIncomingCall).not.toHaveBeenCalled();
      expect(h.rejectIncomingCall).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignorar grava declined local e NENHUM SIP sai daqui', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:05:00.000Z'));
    try {
      const { result } = montar();

      let retorno!: Awaited<ReturnType<typeof result.current.ignorar>>;
      await act(async () => {
        retorno = await result.current.ignorar(whatsapp);
      });

      expect(retorno).toEqual({ ok: true, canal: 'whatsapp' });
      const { args } = gravacaoRpc();
      expect(args).toMatchObject({
        p_id: 'call-wa-1',
        p_direction: 'inbound',
        p_status: 'declined',
        p_end_reason: 'declined',
        p_channel: 'whatsapp',
        p_ended_at: '2026-03-10T12:05:00.000Z',
      });
      expect(h.acceptIncomingCall).not.toHaveBeenCalled();
      expect(h.rejectIncomingCall).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem o id da notificação não age sobre a sessão corrente', async () => {
    const semId = notificacao({ whatsapp_connection_id: 'linha-wa-1', callId: null });
    const { result } = montar();

    let atender!: Awaited<ReturnType<typeof result.current.atender>>;
    let ignorar!: Awaited<ReturnType<typeof result.current.ignorar>>;
    await act(async () => {
      atender = await result.current.atender(semId);
      ignorar = await result.current.ignorar(semId);
    });

    expect(atender).toEqual({ ok: false, canal: 'whatsapp' });
    expect(ignorar).toEqual({ ok: false, canal: 'whatsapp' });
    nadaExecutou();
  });

  it('sem o contato da conversa não age: não há operação alvo', async () => {
    const semContato = notificacao({ whatsapp_connection_id: 'linha-wa-1', contact_id: null });
    const { result } = montar();

    let atender!: Awaited<ReturnType<typeof result.current.atender>>;
    let ignorar!: Awaited<ReturnType<typeof result.current.ignorar>>;
    await act(async () => {
      atender = await result.current.atender(semContato);
      ignorar = await result.current.ignorar(semContato);
    });

    expect(atender).toEqual({ ok: false, canal: 'whatsapp' });
    expect(ignorar).toEqual({ ok: false, canal: 'whatsapp' });
    nadaExecutou();
  });

  it('repetir atender é idempotente: as duas gravações usam o MESMO p_id', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.atender(whatsapp);
      await result.current.atender(whatsapp);
    });

    expect(h.rpc).toHaveBeenCalledTimes(2);
    const ids = h.rpc.mock.calls.map(([, args]) => (args as Record<string, unknown>).p_id);
    expect(ids).toEqual(['call-wa-1', 'call-wa-1']);
  });
});

describe('useAcoesDoAlerta — falha de RLS (a ação não foi confirmada)', () => {
  it('atender retenta 3x e devolve ok: false (o alerta não abre "atendido")', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.atender>>;
    await act(async () => {
      retorno = await result.current.atender(
        notificacao({ whatsapp_connection_id: 'linha-wa-1' }),
      );
    });

    expect(retorno).toEqual({
      ok: false,
      canal: 'whatsapp',
      mensagem: MENSAGEM_ATENDA_WHATSAPP,
    });
    expect(h.rpc).toHaveBeenCalledTimes(3);
    expect(h.acceptIncomingCall).not.toHaveBeenCalled();
  });

  it('ignorar retenta 3x e devolve ok: false', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const { result } = montar();

    let retorno!: Awaited<ReturnType<typeof result.current.ignorar>>;
    await act(async () => {
      retorno = await result.current.ignorar(
        notificacao({ whatsapp_connection_id: 'linha-wa-1' }),
      );
    });

    expect(retorno).toEqual({ ok: false, canal: 'whatsapp' });
    expect(h.rpc).toHaveBeenCalledTimes(3);
    expect(h.rejectIncomingCall).not.toHaveBeenCalled();
  });
});
