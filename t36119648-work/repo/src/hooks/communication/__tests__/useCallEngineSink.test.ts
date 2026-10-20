/**
 * T09/T11/T12/T20 — `useCallEngineSink`, a ponte entre o motor de chamadas (sem
 * React) e o estado/toast/banco do app.
 *
 * O que este arquivo prova (a ponte é o código REAL sob teste; a fila de
 * persistência também é a real, e o BANCO entra pela fronteira `supabase.rpc`):
 * - cada callback do motor cai no setter/toast certo, e a direção é lida da REF
 *   (o sink é memoizado: closure velha aqui marcaria a chamada errada);
 * - `create` fixa o id da linha ANTES de esperar a busca de contato e devolve o
 *   MESMO id que vai para `upsert_my_call` (`p_id`);
 * - as 3 gravações de uma chamada usam o mesmo id e carimbos em UTC (ISO `Z`);
 * - a 2ª chamada com a linha ocupada nasce com id PRÓPRIO (`busy_here`/`missed`)
 *   e não toca o id da chamada em curso;
 * - falha de banco (RLS) é retentada 3x e nunca é silenciosa (log + toast);
 * - a ordem de CHAMADA é a ordem de chegada à RPC, mesmo com a gravação do meio
 *   mais lenta (senão o `answered` tardio sobrescreveria o desfecho).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/** Fronteiras dubladas: log, toast e o cliente Supabase. Nada de rede real. */
const h = vi.hoisted(() => ({
  logError: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, info: h.toastInfo, success: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: h.rpc },
}));

import { useCallEngineSink, type CallEngineSinkDeps } from '../useCallEngineSink';
import { REASON_LABEL } from '@/lib/calls/capabilities';
import {
  criarFilaDePersistencia,
  UPSERT_MY_CALL_RPC,
  type FilaDePersistencia,
} from '@/lib/calls/persistence';
import type { AdapterDirection } from '@/lib/calls/adapters/CallAdapter';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Deps {
  setCallStatus: Mock;
  setCallDirection: Mock;
  setCurrentNumber: Mock;
  setIsMuted: Mock;
  setCurrentCallId: Mock;
  directionRef: { current: AdapterDirection | null };
  startTimer: Mock;
  stopTimer: Mock;
  findContactByPhone: Mock;
  filaDePersistencia: FilaDePersistencia;
  onEnd: Mock;
}

function montarDeps(over: Partial<Deps> = {}): Deps {
  return {
    setCallStatus: vi.fn(),
    setCallDirection: vi.fn(),
    setCurrentNumber: vi.fn(),
    setIsMuted: vi.fn(),
    setCurrentCallId: vi.fn(),
    directionRef: { current: null },
    startTimer: vi.fn(),
    stopTimer: vi.fn(),
    findContactByPhone: vi.fn(async () => 'contato-42'),
    filaDePersistencia: criarFilaDePersistencia(),
    onEnd: vi.fn(),
    ...over,
  };
}

const usar = (deps: Deps) =>
  renderHook(({ d }: { d: Deps }) => useCallEngineSink(d as unknown as CallEngineSinkDeps), {
    initialProps: { d: deps },
  });

/** Uma gravação entregue à RPC (nome + parâmetros `p_*`). */
function gravacoes(): Array<{ rpc: string; args: Record<string, unknown> }> {
  return h.rpc.mock.calls.map(([rpc, args]) => ({
    rpc: rpc as string,
    args: (args ?? {}) as Record<string, unknown>,
  }));
}

const ultima = () => {
  const todas = gravacoes();
  return todas[todas.length - 1];
};

/** Deixa a cadeia da fila (promessas + RPC dublada) escoar. */
async function escoar(voltas = 8): Promise<void> {
  for (let i = 0; i < voltas; i += 1) await Promise.resolve();
}

const PARAMS = {
  contactPhone: '11999992048',
  contactName: '',
  direction: 'outbound' as AdapterDirection,
  sessionId: 'sessao-1',
  providerCallId: 'sip-call-7',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rpc.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCallEngineSink — ponte para estado, timer e toast (T09)', () => {
  it('status, mute e erro caem no setter/toast certos', () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    act(() => result.current.onStatus('active'));
    expect(deps.setCallStatus).toHaveBeenCalledWith('active');

    act(() => result.current.onMuted(true));
    expect(deps.setIsMuted).toHaveBeenCalledWith(true);

    act(() => result.current.onError('VoIP não conectado.'));
    expect(h.toastError).toHaveBeenCalledWith('VoIP não conectado.');
  });

  it('onSession escreve a direção na REF (o sink é memoizado) e no estado', () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    act(() => result.current.onSession('inbound', '5511988887777'));
    expect(deps.directionRef.current).toBe('inbound');
    expect(deps.setCallDirection).toHaveBeenCalledWith('inbound');
    expect(deps.setCurrentNumber).toHaveBeenCalledWith('5511988887777');

    // Volta a ocioso: a ref precisa aceitar null (é ela que o fim lê).
    act(() => result.current.onSession(null, ''));
    expect(deps.directionRef.current).toBeNull();
    expect(deps.setCallDirection).toHaveBeenLastCalledWith(null);
  });

  it('atendida liga o cronômetro e encerrada o para (nunca invertidos)', () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    act(() => result.current.onEstablished());
    expect(deps.startTimer).toHaveBeenCalledTimes(1);
    expect(deps.stopTimer).not.toHaveBeenCalled();

    act(() => result.current.onTerminated());
    expect(deps.stopTimer).toHaveBeenCalledTimes(1);
    expect(deps.startTimer).toHaveBeenCalledTimes(1);
  });
});

describe('useCallEngineSink.create — a linha da chamada (T11)', () => {
  it('usa o sessionId do provider como p_id e grava o contato resolvido', async () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    let id: string | null = null;
    await act(async () => {
      id = await result.current.create(PARAMS);
      await escoar();
    });

    expect(id).toBe('sessao-1');
    expect(deps.setCurrentCallId).toHaveBeenCalledWith('sessao-1');
    expect(deps.findContactByPhone).toHaveBeenCalledWith('11999992048');

    const { rpc, args } = ultima();
    expect(rpc).toBe(UPSERT_MY_CALL_RPC);
    expect(args).toMatchObject({
      p_id: 'sessao-1',
      p_direction: 'outbound',
      p_status: 'ringing',
      p_channel: 'voip',
      p_peer_number: '11999992048',
      p_contact_id: 'contato-42',
      p_provider_call_id: 'sip-call-7',
    });
  });

  it('fixa o id ANTES de esperar a busca de contato (a linha já tem dono)', async () => {
    let liberar: () => void = () => undefined;
    const deps = montarDeps({
      findContactByPhone: vi.fn(
        () => new Promise<string | null>((resolve) => { liberar = () => resolve('contato-42'); }),
      ),
    });
    const { result } = usar(deps);

    let pendente!: Promise<string | null>;
    await act(async () => {
      pendente = result.current.create(PARAMS);
      await escoar();
    });

    expect(deps.setCurrentCallId).toHaveBeenCalledWith('sessao-1');
    expect(gravacoes()).toHaveLength(0); // ainda não gravou: espera o contato

    await act(async () => {
      liberar();
      await pendente;
      await escoar();
    });
    expect(gravacoes()).toHaveLength(1);
  });

  it('sem sessionId gera id próprio no formato aceito por calls.id (uuid v4)', async () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    let id: string | null = null;
    await act(async () => {
      id = await result.current.create({ ...PARAMS, sessionId: undefined, providerCallId: undefined });
      await escoar();
    });

    expect(id).toMatch(UUID_V4);
    expect(deps.setCurrentCallId).toHaveBeenCalledWith(id);
    expect(ultima().args.p_id).toBe(id);
  });

  it('contato não encontrado omite p_contact_id (não manda null para a RPC)', async () => {
    const deps = montarDeps({ findContactByPhone: vi.fn(async () => null) });
    const { result } = usar(deps);

    await act(async () => {
      await result.current.create(PARAMS);
      await escoar();
    });

    expect(ultima().args.p_contact_id).toBeUndefined();
  });

  it('falha de RLS é retentada 3x, avisa o agente e NÃO derruba a chamada', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const deps = montarDeps();
    const { result } = usar(deps);

    let id: string | null = null;
    await act(async () => {
      id = await result.current.create(PARAMS);
      await escoar();
    });

    // O id continua valendo para o resto do ciclo (answered/fim).
    expect(id).toBe('sessao-1');
    expect(h.rpc).toHaveBeenCalledTimes(3);
    expect(h.toastError).toHaveBeenCalledWith('Não foi possível salvar a ligação');
    expect(h.logError).toHaveBeenCalledWith(
      expect.stringContaining('id=sessao-1'),
      expect.objectContaining({ code: '42501' }),
    );
  });
});

describe('useCallEngineSink — desfecho da chamada (T12)', () => {
  it('onAnswered grava answered com answeredAt em UTC (ISO Z, não o fuso local)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:34:56.789Z'));
    const deps = montarDeps();
    deps.directionRef.current = 'inbound';
    const { result } = usar(deps);

    await act(async () => {
      result.current.onAnswered('call-1');
      await escoar();
    });

    expect(ultima().args).toMatchObject({
      p_id: 'call-1',
      p_direction: 'inbound',
      p_status: 'answered',
      p_answered_at: '2026-03-10T12:34:56.789Z',
    });
  });

  it('sem direção corrente o answered cai em outbound (nunca undefined na RPC)', async () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    await act(async () => {
      result.current.onAnswered('call-1');
      await escoar();
    });

    expect(ultima().args.p_direction).toBe('outbound');
  });

  it('sem direção corrente o FIM também cai em outbound (nunca undefined na RPC)', async () => {
    const deps = montarDeps();
    const { result } = usar(deps);
    // Nenhum `onSession` antes: a ref da direção continua no valor inicial.
    expect(deps.directionRef.current).toBeNull();

    await act(async () => {
      result.current.onFinished('call-1', 7, { endedBy: 'hangup_local', sipCode: null });
      await escoar();
    });

    expect(ultima().args).toMatchObject({
      p_id: 'call-1',
      p_direction: 'outbound',
      p_status: 'ended',
      p_end_reason: 'hangup_local',
      p_talk_seconds: 7,
    });
  });

  it('onFinished zera a linha corrente, avisa o dono do desfecho e grava a duração', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T13:00:00.000Z'));
    const deps = montarDeps();
    deps.directionRef.current = 'outbound';
    const { result } = usar(deps);
    const desfecho = { endedBy: 'hangup_remote', sipCode: null } as const;

    await act(async () => {
      result.current.onFinished('call-1', 42, desfecho);
      await escoar();
    });

    expect(deps.setCurrentCallId).toHaveBeenCalledWith(null);
    expect(deps.onEnd).toHaveBeenCalledWith(desfecho);
    // A linha é liberada ANTES de avisar o fim: a próxima discagem não reaproveita o id.
    expect(deps.setCurrentCallId.mock.invocationCallOrder[0]).toBeLessThan(
      deps.onEnd.mock.invocationCallOrder[0],
    );
    expect(ultima().args).toMatchObject({
      p_id: 'call-1',
      p_direction: 'outbound',
      p_status: 'ended',
      p_end_reason: 'hangup_remote',
      p_talk_seconds: 42,
      p_ended_at: '2026-03-10T13:00:00.000Z',
    });
  });

  it('entrada não atendida virou perdida (missed) com o motivo do remoto', async () => {
    const deps = montarDeps();
    deps.directionRef.current = 'inbound';
    const { result } = usar(deps);

    await act(async () => {
      result.current.onFinished('call-1', null, { endedBy: 'cancel_remote', sipCode: 487 });
      await escoar();
    });

    expect(ultima().args).toMatchObject({
      p_id: 'call-1',
      p_status: 'missed',
      p_end_reason: 'cancelled_remote',
    });
    expect(ultima().args.p_talk_seconds).toBeUndefined();
  });

  it('falha do fim também avisa o agente (nada de fim silencioso)', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501' } });
    const deps = montarDeps();
    const { result } = usar(deps);

    await act(async () => {
      result.current.onFinished('call-1', 10, { endedBy: 'failure', sipCode: null });
      await escoar();
    });

    expect(h.rpc).toHaveBeenCalledTimes(3);
    expect(h.toastError).toHaveBeenCalledWith('Não foi possível salvar a ligação');
  });
});

describe('useCallEngineSink.onBusyHere — 2ª chamada com a linha ocupada (T20)', () => {
  it('nasce com id PRÓPRIO (missed/busy_here) e não toca o id da chamada em curso', async () => {
    const deps = montarDeps();
    const { result } = usar(deps);

    await act(async () => {
      await result.current.create({ ...PARAMS, sessionId: 'call-em-curso' });
      await escoar();
    });
    h.rpc.mockClear();
    deps.setCurrentCallId.mockClear();

    await act(async () => {
      result.current.onBusyHere('5511977776666');
      await escoar();
    });

    const { args } = ultima();
    expect(args.p_id).toMatch(UUID_V4);
    expect(args.p_id).not.toBe('call-em-curso');
    expect(args).toMatchObject({
      p_direction: 'inbound',
      p_status: 'missed',
      p_end_reason: 'busy_here',
      p_channel: 'voip',
      p_peer_number: '5511977776666',
    });
    expect(deps.setCurrentCallId).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalledWith(REASON_LABEL.line_busy_here);
  });
});

describe('useCallEngineSink — ordem de gravação e memoização', () => {
  it('as 3 gravações chegam à RPC na ordem de chamada, mesmo com a do meio mais lenta', async () => {
    const ordem: string[] = [];
    h.rpc.mockImplementation(
      async (_rpc: string, args: Record<string, unknown>) => {
        // O `answered` grava MAIS devagar que o `ended`: sem a fila, o fim seria
        // sobrescrito por `answered` e a linha ficaria "atendida" para sempre.
        const atraso = args.p_status === 'ringing' ? 20 : args.p_status === 'answered' ? 15 : 0;
        await new Promise((resolve) => setTimeout(resolve, atraso));
        ordem.push(String(args.p_status));
        return { error: null };
      },
    );
    const deps = montarDeps();
    const { result } = usar(deps);

    await act(async () => {
      await result.current.create({ ...PARAMS, sessionId: 'sessao-1' });
      await escoar();
    });

    await act(async () => {
      // Os dois no MESMO tique, como os eventos reais (answered e fim).
      result.current.onAnswered('sessao-1');
      result.current.onFinished('sessao-1', 12, { endedBy: 'hangup_local', sipCode: null });
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(ordem).toEqual(['ringing', 'answered', 'ended']);
  });

  it('o sink só é recriado quando uma dep muda (o motor não é rebindado à toa)', () => {
    const deps = montarDeps();
    const { result, rerender } = usar(deps);
    const primeiro = result.current;

    rerender({ d: deps });
    expect(result.current).toBe(primeiro);

    rerender({ d: { ...deps, filaDePersistencia: criarFilaDePersistencia() } });
    expect(result.current).not.toBe(primeiro);
  });
});
