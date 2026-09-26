import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  INVALID_TRANSITION_PREFIX,
  busyHereOutcome,
  endReasonFor,
  initialState,
  isBusyHere,
  isTerminal,
  persistedStatusForEndReason,
  persistedStatusOf,
  reduce,
  sipCodeToEndReason,
} from '../session';
import type {
  CallSessionEvent,
  CallSessionState,
  CallSessionStatus,
  EndReason,
  EndedBy,
  PersistedStatus,
} from '../session';

// ── Fixtures ────────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
const SID_OUT = 'sess-out-0001';
const SID_IN = 'sess-in-0001';
const PHONE = '+5511999992048';
const PHONE_IN = '+5511988887777';

/**
 * Constrói o estado de partida "de verdade", replayando eventos pelo próprio
 * reducer (nada de estado fabricado à mão, exceto `ending` — ver comentário).
 */
function estadoDe(status: CallSessionStatus): CallSessionState {
  switch (status) {
    case 'idle':
      return initialState();
    case 'dialing':
      return reduce(initialState(), {
        type: 'DIAL',
        sessionId: SID_OUT,
        channel: 'voip',
        phone: PHONE,
        name: 'Ana Souza',
        at: T0,
      });
    case 'ringing_out':
      return reduce(estadoDe('dialing'), { type: 'RINGING', at: T0 + 10 });
    case 'ringing_in':
      return reduce(initialState(), {
        type: 'INVITE_RECEIVED',
        sessionId: SID_IN,
        channel: 'voip',
        phone: PHONE_IN,
        name: 'Bruno Lima',
        at: T0,
      });
    case 'connecting':
      return reduce(estadoDe('ringing_in'), { type: 'ACCEPT', at: T0 + 20 });
    case 'active':
      return reduce(estadoDe('dialing'), { type: 'ESTABLISHED', at: T0 + 30 });
    case 'ending':
      // `ending` é o passo intermediário da tabela (HANGUP_LOCAL: ending→ended).
      // O reducer colapsa o passo e devolve `ended` na mesma chamada, então o
      // único jeito de observar `ending` é hidratando o estado (provider/UI).
      return {
        ...estadoDe('dialing'),
        status: 'ending',
        endReason: 'cancelled',
        endedBy: 'hangup_local',
        endedAt: T0 + 40,
      };
    case 'ended':
      return reduce(estadoDe('dialing'), { type: 'HANGUP_LOCAL', at: T0 + 40 });
  }
}

type CasoValido = {
  de: CallSessionStatus;
  evento: CallSessionEvent;
  para: CallSessionStatus;
  endReason: EndReason | null;
  endedBy: EndedBy | null;
  persisted: PersistedStatus | null;
  extras?: Partial<CallSessionState>;
};

/**
 * TODAS as transições válidas do Apêndice C, uma linha da tabela por caso.
 * As marcadas "extensão" cobrem saídas de `connecting`/`ending`, que a tabela
 * deixa em aberto e sem as quais a máquina ficaria presa.
 */
const VALIDAS: CasoValido[] = [
  // ida (outbound)
  { de: 'idle', evento: { type: 'DIAL', sessionId: SID_OUT, phone: PHONE, at: T0 }, para: 'dialing', endReason: null, endedBy: null, persisted: 'ringing', extras: { sessionId: SID_OUT, direction: 'outbound', answeredAt: null } },
  { de: 'dialing', evento: { type: 'RINGING', at: T0 + 1 }, para: 'ringing_out', endReason: null, endedBy: null, persisted: 'ringing' },
  { de: 'dialing', evento: { type: 'ESTABLISHED', at: T0 + 30 }, para: 'active', endReason: null, endedBy: null, persisted: 'answered', extras: { answeredAt: T0 + 30 } },
  { de: 'ringing_out', evento: { type: 'ESTABLISHED', at: T0 + 31 }, para: 'active', endReason: null, endedBy: null, persisted: 'answered', extras: { answeredAt: T0 + 31 } },
  { de: 'dialing', evento: { type: 'HANGUP_LOCAL', at: T0 + 5 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' },
  { de: 'ringing_out', evento: { type: 'HANGUP_LOCAL', at: T0 + 6 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' },
  { de: 'connecting', evento: { type: 'HANGUP_LOCAL', at: T0 + 7 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' }, // extensão
  { de: 'dialing', evento: { type: 'FAILED', code: 408, at: T0 + 8 }, para: 'ended', endReason: 'no_answer', endedBy: 'failure', persisted: 'ended' },
  { de: 'ringing_out', evento: { type: 'FAILED', code: 486, at: T0 + 9 }, para: 'ended', endReason: 'busy', endedBy: 'failure', persisted: 'busy' },
  { de: 'ringing_out', evento: { type: 'FAILED', code: 503, at: T0 + 9 }, para: 'ended', endReason: 'failed', endedBy: 'failure', persisted: 'failed' },
  { de: 'connecting', evento: { type: 'FAILED', code: 480, at: T0 + 9 }, para: 'ended', endReason: 'no_answer', endedBy: 'failure', persisted: 'ended' }, // extensão
  { de: 'dialing', evento: { type: 'HANGUP_REMOTE', at: T0 + 11 }, para: 'ended', endReason: 'no_answer', endedBy: 'hangup_remote', persisted: 'ended' },
  { de: 'ringing_out', evento: { type: 'HANGUP_REMOTE', code: 603, at: T0 + 12 }, para: 'ended', endReason: 'declined', endedBy: 'hangup_remote', persisted: 'declined' },
  { de: 'ringing_out', evento: { type: 'HANGUP_REMOTE', code: 487, at: T0 + 12 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_remote', persisted: 'cancelled' },
  // vinda (inbound)
  { de: 'idle', evento: { type: 'INVITE_RECEIVED', sessionId: SID_IN, phone: PHONE_IN, at: T0 }, para: 'ringing_in', endReason: null, endedBy: null, persisted: 'ringing', extras: { sessionId: SID_IN, direction: 'inbound', answeredAt: null } },
  { de: 'ringing_in', evento: { type: 'ACCEPT', at: T0 + 21 }, para: 'connecting', endReason: null, endedBy: null, persisted: 'answered' },
  { de: 'connecting', evento: { type: 'ESTABLISHED', at: T0 + 32 }, para: 'active', endReason: null, endedBy: null, persisted: 'answered', extras: { answeredAt: T0 + 32 } },
  { de: 'ringing_in', evento: { type: 'REJECT', at: T0 + 22 }, para: 'ended', endReason: 'declined', endedBy: 'reject', persisted: 'declined' },
  { de: 'ringing_in', evento: { type: 'CANCEL_REMOTE', at: T0 + 23 }, para: 'ended', endReason: 'cancelled_remote', endedBy: 'cancel_remote', persisted: 'missed' },
  { de: 'ringing_in', evento: { type: 'TIMEOUT', at: T0 + 24 }, para: 'ended', endReason: 'timeout', endedBy: 'timeout', persisted: 'missed' },
  // em conversa
  { de: 'active', evento: { type: 'HANGUP_LOCAL', at: T0 + 50 }, para: 'ended', endReason: 'completed', endedBy: 'hangup_local', persisted: 'ended', extras: { answeredAt: T0 + 30 } },
  { de: 'active', evento: { type: 'HANGUP_REMOTE', at: T0 + 51 }, para: 'ended', endReason: 'completed', endedBy: 'hangup_remote', persisted: 'ended' },
  { de: 'active', evento: { type: 'HANGUP_REMOTE', code: 200, at: T0 + 51 }, para: 'ended', endReason: 'completed', endedBy: 'hangup_remote', persisted: 'ended' },
  { de: 'active', evento: { type: 'FAILED', code: 500, at: T0 + 52 }, para: 'ended', endReason: 'failed', endedBy: 'failure', persisted: 'failed' },
  // finalização de um encerramento já em curso (`ending`)
  { de: 'ending', evento: { type: 'HANGUP_LOCAL', at: T0 + 41 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' }, // extensão
  { de: 'ending', evento: { type: 'HANGUP_REMOTE', at: T0 + 42 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' }, // extensão
  { de: 'ending', evento: { type: 'FAILED', code: 500, at: T0 + 43 }, para: 'ended', endReason: 'cancelled', endedBy: 'hangup_local', persisted: 'cancelled' }, // extensão
  // volta para o início
  { de: 'ended', evento: { type: 'RESET', at: T0 + 60 }, para: 'idle', endReason: null, endedBy: null, persisted: null, extras: { sessionId: null, answeredAt: null, endedAt: null } },
];

/** Transições INVÁLIDAS: estado inalterado (mesma referência) + 1 warn. */
const INVALIDAS: Array<{ de: CallSessionStatus; evento: CallSessionEvent }> = [
  { de: 'idle', evento: { type: 'RINGING', at: T0 } },
  { de: 'idle', evento: { type: 'ESTABLISHED', at: T0 } },
  { de: 'idle', evento: { type: 'HANGUP_LOCAL', at: T0 } },
  { de: 'idle', evento: { type: 'HANGUP_REMOTE', at: T0 } },
  { de: 'idle', evento: { type: 'FAILED', code: 500, at: T0 } },
  { de: 'idle', evento: { type: 'ACCEPT', at: T0 } },
  { de: 'idle', evento: { type: 'REJECT', at: T0 } },
  { de: 'idle', evento: { type: 'CANCEL_REMOTE', at: T0 } },
  { de: 'idle', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'idle', evento: { type: 'RESET', at: T0 } },
  { de: 'dialing', evento: { type: 'DIAL', sessionId: 'sess-out-9999', at: T0 } },
  { de: 'dialing', evento: { type: 'ACCEPT', at: T0 } },
  { de: 'dialing', evento: { type: 'REJECT', at: T0 } },
  { de: 'dialing', evento: { type: 'CANCEL_REMOTE', at: T0 } },
  { de: 'dialing', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'dialing', evento: { type: 'RESET', at: T0 } },
  { de: 'ringing_out', evento: { type: 'RINGING', at: T0 } },
  { de: 'ringing_out', evento: { type: 'ACCEPT', at: T0 } },
  { de: 'ringing_out', evento: { type: 'REJECT', at: T0 } },
  { de: 'ringing_out', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'ringing_out', evento: { type: 'RESET', at: T0 } },
  { de: 'ringing_in', evento: { type: 'RINGING', at: T0 } },
  { de: 'ringing_in', evento: { type: 'ESTABLISHED', at: T0 } },
  { de: 'ringing_in', evento: { type: 'HANGUP_LOCAL', at: T0 } },
  { de: 'ringing_in', evento: { type: 'HANGUP_REMOTE', at: T0 } },
  { de: 'ringing_in', evento: { type: 'DIAL', sessionId: SID_OUT, at: T0 } },
  { de: 'ringing_in', evento: { type: 'RESET', at: T0 } },
  { de: 'connecting', evento: { type: 'RINGING', at: T0 } },
  { de: 'connecting', evento: { type: 'ACCEPT', at: T0 } },
  { de: 'connecting', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'connecting', evento: { type: 'RESET', at: T0 } },
  { de: 'active', evento: { type: 'RINGING', at: T0 } },
  { de: 'active', evento: { type: 'ESTABLISHED', at: T0 } },
  { de: 'active', evento: { type: 'ACCEPT', at: T0 } },
  { de: 'active', evento: { type: 'REJECT', at: T0 } },
  { de: 'active', evento: { type: 'CANCEL_REMOTE', at: T0 } },
  { de: 'active', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'active', evento: { type: 'DIAL', sessionId: 'sess-out-9999', at: T0 } },
  { de: 'active', evento: { type: 'RESET', at: T0 } },
  { de: 'ended', evento: { type: 'DIAL', sessionId: 'sess-out-9999', at: T0 } },
  { de: 'ended', evento: { type: 'RINGING', at: T0 } },
  { de: 'ended', evento: { type: 'ESTABLISHED', at: T0 } },
  { de: 'ended', evento: { type: 'HANGUP_LOCAL', at: T0 } },
  { de: 'ended', evento: { type: 'HANGUP_REMOTE', at: T0 } },
  { de: 'ended', evento: { type: 'TIMEOUT', at: T0 } },
  { de: 'ended', evento: { type: 'ACCEPT', at: T0 } },
];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ultimoWarn(): string {
  const chamadas = vi.mocked(console.warn).mock.calls;
  expect(chamadas).toHaveLength(1);
  return String(chamadas[0][0]);
}

// ── Testes ──────────────────────────────────────────────────────────────────

describe('session — estado inicial', () => {
  it('devolve um objeto novo, ocioso e sem sessão', () => {
    const a = initialState();
    const b = initialState();
    expect(a).not.toBe(b);
    expect(a).toEqual({
      status: 'idle',
      sessionId: null,
      direction: null,
      channel: 'voip',
      phone: null,
      name: null,
      startedAt: null,
      answeredAt: null,
      endedAt: null,
      endReason: null,
      endedBy: null,
      sipCode: null,
    });
  });
});

describe('session — transições válidas (Apêndice C)', () => {
  for (const caso of VALIDAS) {
    it(`${caso.de} + ${caso.evento.type} → ${caso.para}`, () => {
      const estado = estadoDe(caso.de);
      const proximo = reduce(estado, caso.evento);

      expect(proximo).not.toBe(estado); // transição válida produz estado novo
      expect(proximo.status).toBe(caso.para);
      expect(proximo.endReason).toBe(caso.endReason);
      expect(proximo.endedBy).toBe(caso.endedBy);
      expect(persistedStatusOf(proximo)).toBe(caso.persisted);
      // o id nunca muda a partir do momento em que existe (DIAL/INVITE_RECEIVED)
      // e só volta a null no RESET (único caso que termina em idle)
      if (estado.sessionId !== null && caso.para !== 'idle') {
        expect(proximo.sessionId).toBe(estado.sessionId);
      }
      if (caso.extras) expect(proximo).toMatchObject(caso.extras);
      expect(console.warn).not.toHaveBeenCalled();
    });
  }
});

describe('session — transições inválidas', () => {
  expect(INVALIDAS.length).toBeGreaterThanOrEqual(10);

  for (const caso of INVALIDAS) {
    it(`${caso.de} + ${caso.evento.type} → inalterado + warn`, () => {
      const estado = estadoDe(caso.de);
      const proximo = reduce(estado, caso.evento);

      expect(proximo).toBe(estado); // mesma referência: nada mudou
      const mensagem = ultimoWarn();
      expect(mensagem).toContain(INVALID_TRANSITION_PREFIX);
      expect(mensagem).toContain(estado.status);
      expect(mensagem).toContain(caso.evento.type);
      expect(mensagem).toContain(`sessionId=${estado.sessionId ?? 'null'}`);
    });
  }

  it('evento desconhecido em runtime: warn, estado inalterado e nenhuma exceção', () => {
    const estado = estadoDe('active');
    const estranho = { type: 'INVITE_SENT' } as unknown as CallSessionEvent;

    let proximo: CallSessionState | null = null;
    expect(() => {
      proximo = reduce(estado, estranho);
    }).not.toThrow();
    expect(proximo).toBe(estado);
    const mensagem = ultimoWarn();
    expect(mensagem).toContain('INVITE_SENT');
    expect(mensagem).toContain(`sessionId=${SID_OUT}`);
  });

  it('não troca o sessionId nem o answeredAt por causa de evento inválido', () => {
    const estado = estadoDe('active');
    const proximo = reduce(estado, { type: 'TIMEOUT', at: T0 + 900 });
    expect(proximo.sessionId).toBe(SID_OUT);
    expect(proximo.answeredAt).toBe(T0 + 30);
  });
});

describe('session — invariantes', () => {
  it('sessionId é fixado no DIAL e só muda no RESET', () => {
    const dialing = reduce(initialState(), { type: 'DIAL', sessionId: SID_OUT, phone: PHONE, at: T0 });
    expect(dialing.sessionId).toBe(SID_OUT);

    const active = reduce(dialing, { type: 'ESTABLISHED', at: T0 + 1 });
    const ended = reduce(active, { type: 'HANGUP_LOCAL', at: T0 + 2 });
    expect(active.sessionId).toBe(SID_OUT);
    expect(ended.sessionId).toBe(SID_OUT);

    // DIAL repetido com outro id é inválido: o id continua o original
    const segundo = reduce(dialing, { type: 'DIAL', sessionId: 'sess-out-9999', at: T0 + 3 });
    expect(segundo).toBe(dialing);
    expect(segundo.sessionId).toBe(SID_OUT);

    expect(reduce(ended, { type: 'RESET', at: T0 + 4 }).sessionId).toBeNull();
  });

  it('sessionId é fixado no INVITE_RECEIVED', () => {
    const ringing = reduce(initialState(), { type: 'INVITE_RECEIVED', sessionId: SID_IN, phone: PHONE_IN, at: T0 });
    expect(ringing.sessionId).toBe(SID_IN);
    expect(ringing.direction).toBe('inbound');
    expect(ringing.startedAt).toBe(T0);
    expect(reduce(ringing, { type: 'ACCEPT', at: T0 + 1 }).sessionId).toBe(SID_IN);
    expect(reduce(ringing, { type: 'TIMEOUT', at: T0 + 2 }).sessionId).toBe(SID_IN);
  });

  it('answeredAt só é definido no ESTABLISHED', () => {
    const dialing = estadoDe('dialing');
    const ringingOut = estadoDe('ringing_out');
    const ringingIn = estadoDe('ringing_in');
    const connecting = estadoDe('connecting');

    for (const estado of [dialing, ringingOut, ringingIn, connecting]) {
      expect(estado.answeredAt).toBeNull();
    }
    expect(reduce(ringingIn, { type: 'ACCEPT', at: T0 }).answeredAt).toBeNull();
    expect(reduce(ringingOut, { type: 'HANGUP_REMOTE', at: T0 }).answeredAt).toBeNull();

    const atendeuSaida = reduce(ringingOut, { type: 'ESTABLISHED', at: T0 + 77 });
    const atendeuEntrada = reduce(connecting, { type: 'ESTABLISHED', at: T0 + 78 });
    expect(atendeuSaida.answeredAt).toBe(T0 + 77);
    expect(atendeuEntrada.answeredAt).toBe(T0 + 78);

    // preservado no encerramento e limpo no RESET
    const ended = reduce(atendeuSaida, { type: 'HANGUP_LOCAL', at: T0 + 90 });
    expect(ended.answeredAt).toBe(T0 + 77);
    expect(reduce(ended, { type: 'RESET', at: T0 + 91 }).answeredAt).toBeNull();
  });

  it('TIMEOUT só é válido em ringing_in', () => {
    const entrando = estadoDe('ringing_in');
    const terminada = reduce(entrando, { type: 'TIMEOUT', at: T0 + 5 });
    expect(terminada.status).toBe('ended');
    expect(terminada.endReason).toBe('timeout');

    for (const status of ['idle', 'dialing', 'ringing_out', 'connecting', 'active', 'ended'] as CallSessionStatus[]) {
      const estado = estadoDe(status);
      const proximo = reduce(estado, { type: 'TIMEOUT', at: T0 + 5 });
      expect(proximo).toBe(estado);
      expect(ultimoWarn()).toContain(`TIMEOUT`);
      vi.mocked(console.warn).mockClear();
    }
  });

  it('RESET só a partir de ended', () => {
    expect(reduce(initialState(), { type: 'RESET' })).toEqual(initialState());
    expect(console.warn).toHaveBeenCalledTimes(1);

    const ended = estadoDe('ended');
    const ocioso = reduce(ended, { type: 'RESET', at: T0 + 99 });
    expect(ocioso.status).toBe('idle');
    expect(ocioso.endReason).toBeNull();
    expect(ocioso.endedBy).toBeNull();
    expect(ocioso.endedAt).toBeNull();
    expect(ocioso.startedAt).toBeNull();
    expect(ocioso.direction).toBeNull();
    expect(persistedStatusOf(ocioso)).toBeNull();
  });

  it('INVITE_RECEIVED com a linha ocupada devolve o MESMO estado, sem warn', () => {
    const eventos: CallSessionStatus[] = ['dialing', 'ringing_out', 'ringing_in', 'connecting', 'active', 'ended'];
    for (const status of eventos) {
      const estado = estadoDe(status);
      const segundoConvite: CallSessionEvent = { type: 'INVITE_RECEIVED', sessionId: 'sess-in-0002', phone: PHONE_IN, at: T0 };
      const proximo = reduce(estado, segundoConvite);

      expect(proximo).toBe(estado);
      expect(proximo.sessionId).toBe(estado.sessionId);
      expect(isBusyHere(estado, segundoConvite)).toBe(true);
      expect(console.warn).not.toHaveBeenCalled();
    }

    const ocioso = initialState();
    const convite: CallSessionEvent = { type: 'INVITE_RECEIVED', sessionId: SID_IN, phone: PHONE_IN, at: T0 };
    expect(isBusyHere(ocioso, convite)).toBe(false);
    expect(reduce(ocioso, convite).status).toBe('ringing_in');
  });

  it('a segunda chamada ocupada é registrada fora da máquina como missed/busy_here', () => {
    expect(busyHereOutcome()).toEqual({ persistedStatus: 'missed', endReason: 'busy' });
  });

  it('HANGUP_LOCAL em active encerra como completed/hangup_local', () => {
    const active = estadoDe('active');
    const encerrada = reduce(active, { type: 'HANGUP_LOCAL', at: T0 + 100 });
    expect(encerrada.status).toBe('ended');
    expect(encerrada.endReason).toBe('completed');
    expect(encerrada.endedBy).toBe('hangup_local');
    expect(encerrada.endedAt).toBe(T0 + 100);
    expect(persistedStatusOf(encerrada)).toBe('ended');
  });

  it('HANGUP_LOCAL antes de atender encerra como cancelled', () => {
    for (const status of ['dialing', 'ringing_out'] as CallSessionStatus[]) {
      const encerrada = reduce(estadoDe(status), { type: 'HANGUP_LOCAL', at: T0 + 100 });
      expect(encerrada.endReason).toBe('cancelled');
      expect(encerrada.endedBy).toBe('hangup_local');
      expect(persistedStatusOf(encerrada)).toBe('cancelled');
    }
  });

  it('REJECT encerra como declined; CANCEL_REMOTE e TIMEOUT como missed', () => {
    const recusada = reduce(estadoDe('ringing_in'), { type: 'REJECT', at: T0 + 1 });
    expect([recusada.endReason, persistedStatusOf(recusada)]).toEqual(['declined', 'declined']);

    const cancelada = reduce(estadoDe('ringing_in'), { type: 'CANCEL_REMOTE', code: 487, at: T0 + 1 });
    expect([cancelada.endReason, persistedStatusOf(cancelada)]).toEqual(['cancelled_remote', 'missed']);

    const expirada = reduce(estadoDe('ringing_in'), { type: 'TIMEOUT', at: T0 + 1 });
    expect([expirada.endReason, persistedStatusOf(expirada)]).toEqual(['timeout', 'missed']);
  });

  it('sipCode fica registrado no estado encerrado', () => {
    expect(reduce(estadoDe('ringing_out'), { type: 'FAILED', code: 486, at: T0 }).sipCode).toBe(486);
    expect(reduce(estadoDe('ringing_out'), { type: 'HANGUP_REMOTE', code: 603, at: T0 }).sipCode).toBe(603);
    expect(reduce(estadoDe('dialing'), { type: 'HANGUP_LOCAL', at: T0 }).sipCode).toBeNull();
  });
});

describe('session — endReasonFor', () => {
  it('devolve o motivo do encerramento por estado', () => {
    expect(endReasonFor(estadoDe('active'), { type: 'HANGUP_LOCAL' })).toBe('completed');
    expect(endReasonFor(estadoDe('active'), { type: 'HANGUP_REMOTE' })).toBe('completed');
    expect(endReasonFor(estadoDe('active'), { type: 'FAILED', code: 500 })).toBe('failed');
    expect(endReasonFor(estadoDe('dialing'), { type: 'HANGUP_LOCAL' })).toBe('cancelled');
    expect(endReasonFor(estadoDe('ringing_out'), { type: 'HANGUP_LOCAL' })).toBe('cancelled');
    expect(endReasonFor(estadoDe('dialing'), { type: 'FAILED', code: 486 })).toBe('busy');
    expect(endReasonFor(estadoDe('dialing'), { type: 'FAILED', code: 603 })).toBe('declined');
    expect(endReasonFor(estadoDe('dialing'), { type: 'HANGUP_REMOTE' })).toBe('no_answer');
    expect(endReasonFor(estadoDe('ringing_out'), { type: 'HANGUP_REMOTE', code: 603 })).toBe('declined');
    expect(endReasonFor(estadoDe('ringing_in'), { type: 'REJECT' })).toBe('declined');
    expect(endReasonFor(estadoDe('ringing_in'), { type: 'CANCEL_REMOTE' })).toBe('cancelled_remote');
    expect(endReasonFor(estadoDe('ringing_in'), { type: 'TIMEOUT' })).toBe('timeout');
  });

  it('devolve null quando o evento não encerra a chamada neste estado', () => {
    expect(endReasonFor(initialState(), { type: 'HANGUP_LOCAL' })).toBeNull();
    expect(endReasonFor(initialState(), { type: 'TIMEOUT' })).toBeNull();
    expect(endReasonFor(estadoDe('ringing_out'), { type: 'TIMEOUT' })).toBeNull();
    expect(endReasonFor(estadoDe('active'), { type: 'REJECT' })).toBeNull();
    expect(endReasonFor(estadoDe('active'), { type: 'CANCEL_REMOTE' })).toBeNull();
    expect(endReasonFor(estadoDe('ended'), { type: 'CANCEL_REMOTE' })).toBeNull();
    expect(endReasonFor(estadoDe('active'), { type: 'ESTABLISHED' })).toBeNull();
    expect(endReasonFor(estadoDe('ended'), { type: 'RESET' })).toBeNull();
  });

  it('em ending preserva o motivo já decidido', () => {
    const ending = estadoDe('ending');
    expect(endReasonFor(ending, { type: 'HANGUP_REMOTE' })).toBe('cancelled');
    expect(endReasonFor(ending, { type: 'FAILED', code: 500 })).toBe('cancelled');
  });
});

describe('session — sipCodeToEndReason', () => {
  it('mapeia os códigos SIP do plano', () => {
    expect(sipCodeToEndReason(200)).toBe('completed');
    expect(sipCodeToEndReason(486)).toBe('busy');
    expect(sipCodeToEndReason(408)).toBe('no_answer');
    expect(sipCodeToEndReason(480)).toBe('no_answer');
    expect(sipCodeToEndReason(487)).toBe('cancelled');
    expect(sipCodeToEndReason(603)).toBe('declined'); // 603 ganha do 5xx/6xx
    expect(sipCodeToEndReason(500)).toBe('failed');
    expect(sipCodeToEndReason(503)).toBe('failed');
    expect(sipCodeToEndReason(404)).toBe('failed'); // não mapeado → failed
  });
});

describe('session — persistedStatus', () => {
  it('traduz o estado corrente para calls.status', () => {
    expect(persistedStatusOf(initialState())).toBeNull();
    expect(persistedStatusOf(estadoDe('dialing'))).toBe('ringing');
    expect(persistedStatusOf(estadoDe('ringing_out'))).toBe('ringing');
    expect(persistedStatusOf(estadoDe('ringing_in'))).toBe('ringing');
    expect(persistedStatusOf(estadoDe('connecting'))).toBe('answered');
    expect(persistedStatusOf(estadoDe('active'))).toBe('answered');
    expect(persistedStatusOf(estadoDe('ending'))).toBe('ringing');
    expect(persistedStatusOf({ ...estadoDe('ending'), answeredAt: T0 })).toBe('answered');
  });

  it('traduz cada end_reason (seção 2.7)', () => {
    expect(persistedStatusForEndReason(null)).toBeNull();
    expect(persistedStatusForEndReason('completed')).toBe('ended');
    expect(persistedStatusForEndReason('no_answer')).toBe('ended');
    expect(persistedStatusForEndReason('cancelled')).toBe('cancelled');
    expect(persistedStatusForEndReason('cancelled_remote')).toBe('missed');
    expect(persistedStatusForEndReason('timeout')).toBe('missed');
    expect(persistedStatusForEndReason('declined')).toBe('declined');
    expect(persistedStatusForEndReason('busy')).toBe('busy');
    expect(persistedStatusForEndReason('failed')).toBe('failed');
    // Todos os valores da união canônica de `./callStatus` (o EndReason deixou
    // de ser uma união local em 26/09/2026): ligação atendida que termina por
    // qualquer um dos lados vira `ended`; segunda chamada recebida vira `missed`.
    expect(persistedStatusForEndReason('hangup_local')).toBe('ended');
    expect(persistedStatusForEndReason('hangup_remote')).toBe('ended');
    expect(persistedStatusForEndReason('busy_here')).toBe('missed');
  });

  it('cobre a união canônica inteira de EndReason (nenhum valor devolve undefined)', () => {
    const todos: EndReason[] = [
      'completed',
      'busy',
      'no_answer',
      'cancelled',
      'declined',
      'failed',
      'cancelled_remote',
      'timeout',
      'busy_here',
      'hangup_local',
      'hangup_remote',
    ];
    for (const motivo of todos) {
      expect(persistedStatusForEndReason(motivo)).not.toBeUndefined();
    }
    expect(todos.map(persistedStatusForEndReason)).toEqual([
      'ended',
      'busy',
      'ended',
      'cancelled',
      'declined',
      'failed',
      'missed',
      'missed',
      'missed',
      'ended',
      'ended',
    ]);
  });

  it('sipCodeToEndReason é a mesma função de ./callStatus (sem cópia local)', async () => {
    const callStatus = await import('../callStatus');
    expect(sipCodeToEndReason).toBe(callStatus.sipCodeToEndReason);
  });

  it('isTerminal só é true em ended', () => {
    const todos: CallSessionStatus[] = ['idle', 'dialing', 'ringing_out', 'ringing_in', 'connecting', 'active', 'ending', 'ended'];
    expect(todos.filter(isTerminal)).toEqual(['ended']);
  });
});
