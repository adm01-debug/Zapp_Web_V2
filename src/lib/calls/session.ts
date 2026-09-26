/**
 * Máquina de estados pura da sessão de chamada — Apêndice C de
 * `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` (etapa 14).
 *
 * Contrato de pureza:
 * - ZERO import de bibliotecas de UI ou de backend: só `estado + evento → estado`.
 * - Único efeito colateral permitido: `console.warn` em transição inválida.
 * - Nada aqui lança exceção: transição inválida devolve o MESMO objeto de
 *   estado recebido (identidade preservada) e registra um warn com o sessionId.
 *
 * Invariantes (Apêndice C):
 * - `sessionId` só é fixado em DIAL/INVITE_RECEIVED e nunca muda até RESET;
 * - `answeredAt` só é definido em ESTABLISHED;
 * - TIMEOUT só é válido em `ringing_in`;
 * - RESET só é válido a partir de `ended`;
 * - INVITE_RECEIVED com a sessão ocupada NÃO é tratado aqui (a segunda
 *   chamada vira `missed` com motivo `busy_here` fora da máquina).
 */

/** Estados do ciclo de vida da chamada (Apêndice C). */
export type CallSessionStatus =
  | 'idle'
  | 'dialing'
  | 'ringing_out'
  | 'ringing_in'
  | 'connecting'
  | 'active'
  | 'ending'
  | 'ended';

/** Direção da chamada (coluna `calls.direction`). */
export type SessionDirection = 'inbound' | 'outbound';

/** Canal do transporte — mesma união de `calls.channel` (seção 2.7). */
export type SessionChannel = 'voip' | 'whatsapp';

/** Motivo de encerramento (coluna `calls.end_reason`). */
export type EndReason =
  | 'completed'
  | 'cancelled'
  | 'cancelled_remote'
  | 'declined'
  | 'timeout'
  | 'no_answer'
  | 'busy'
  | 'failed';

/** Como a chamada terminou do nosso ponto de vista (origem do encerramento). */
export type EndedBy =
  | 'hangup_local'
  | 'hangup_remote'
  | 'reject'
  | 'cancel_remote'
  | 'timeout'
  | 'failure';

/**
 * Status persistido em `calls.status` (união da seção 2.7 do plano, sem
 * apagar legado: `completed`→`ended` e `ongoing`→`answered` são traduzidos na
 * leitura, nunca reescritos).
 */
export type PersistedStatus =
  | 'ringing'
  | 'answered'
  | 'ended'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'declined';

/** Marca temporal comum a todos os eventos (epoch ms). */
export interface CallSessionEventStamp {
  /** Epoch ms do evento (vem do SIP/webhook). Default: `Date.now()`. */
  at?: number;
}

/** Eventos aceitos pela máquina (exatamente os do Apêndice C). */
export type CallSessionEvent =
  | ({ type: 'DIAL'; sessionId: string; channel?: SessionChannel; phone?: string; name?: string } & CallSessionEventStamp)
  | ({ type: 'RINGING' } & CallSessionEventStamp)
  | ({ type: 'ESTABLISHED' } & CallSessionEventStamp)
  | ({ type: 'HANGUP_LOCAL' } & CallSessionEventStamp)
  | ({ type: 'HANGUP_REMOTE'; code?: number } & CallSessionEventStamp)
  | ({ type: 'FAILED'; code: number } & CallSessionEventStamp)
  | ({ type: 'INVITE_RECEIVED'; sessionId: string; channel?: SessionChannel; phone?: string; name?: string } & CallSessionEventStamp)
  | ({ type: 'ACCEPT' } & CallSessionEventStamp)
  | ({ type: 'REJECT'; code?: number } & CallSessionEventStamp)
  | ({ type: 'CANCEL_REMOTE'; code?: number } & CallSessionEventStamp)
  | ({ type: 'TIMEOUT' } & CallSessionEventStamp)
  | ({ type: 'RESET' } & CallSessionEventStamp);

export type CallSessionEventType = CallSessionEvent['type'];

/** Estado completo da sessão. Imutável: `reduce` sempre devolve novo objeto. */
export interface CallSessionState {
  status: CallSessionStatus;
  sessionId: string | null;
  direction: SessionDirection | null;
  channel: SessionChannel;
  phone: string | null;
  name: string | null;
  startedAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
  endedBy: EndedBy | null;
  sipCode: number | null;
}

/** Prefixo estável do warn de transição inválida (usado pelos testes/logs). */
export const INVALID_TRANSITION_PREFIX = '[call-session] transição inválida ignorada';

/** Eventos que encerram a chamada em pelo menos um estado. */
type EndingEventType = 'HANGUP_LOCAL' | 'HANGUP_REMOTE' | 'FAILED' | 'REJECT' | 'CANCEL_REMOTE' | 'TIMEOUT';

/** Origem do encerramento por tipo de evento. */
const ENDED_BY: Record<EndingEventType, EndedBy> = {
  HANGUP_LOCAL: 'hangup_local',
  HANGUP_REMOTE: 'hangup_remote',
  FAILED: 'failure',
  REJECT: 'reject',
  CANCEL_REMOTE: 'cancel_remote',
  TIMEOUT: 'timeout',
};

/**
 * Estado inicial: ocioso, sem sessão. Sempre devolve um objeto novo (o estado
 * é imutável e nunca deve ser compartilhado entre sessões).
 */
export function initialState(): CallSessionState {
  return {
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
  };
}

/** `true` quando a sessão já terminou e só aceita RESET. */
export function isTerminal(status: CallSessionStatus): boolean {
  return status === 'ended';
}

/**
 * Código SIP → `end_reason` (200→completed, 486→busy, 480/408→no_answer,
 * 487→cancelled, 603→declined, 5xx/desconhecido→failed).
 *
 * O dono canônico é a etapa 10 (`callStatus.ts`), que expõe o mesmo mapa;
 * esta cópia existe para o módulo de sessão ficar sem dependências — ao
 * consolidar a Fase 1, trocar por `import { sipCodeToEndReason } from './callStatus'`.
 */
export function sipCodeToEndReason(code: number): EndReason {
  if (code === 200) return 'completed';
  if (code === 486) return 'busy';
  if (code === 408 || code === 480) return 'no_answer';
  if (code === 487) return 'cancelled';
  if (code === 603) return 'declined';
  if (code >= 500) return 'failed';
  return 'failed';
}

/** Status a persistir para um `end_reason` já decidido (seção 2.7). */
export function persistedStatusForEndReason(endReason: EndReason | null): PersistedStatus | null {
  switch (endReason) {
    case null:
      return null;
    case 'completed':
    case 'no_answer':
      return 'ended';
    case 'cancelled':
      return 'cancelled';
    case 'cancelled_remote':
    case 'timeout':
      return 'missed';
    case 'declined':
      return 'declined';
    case 'busy':
      return 'busy';
    case 'failed':
      return 'failed';
  }
}

/**
 * Status a gravar em `calls.status` no estado atual. `null` = nada a persistir
 * ainda (sessão ociosa). Serve tanto para o upsert de `DIAL|INVITE_RECEIVED` e
 * `ESTABLISHED` quanto para o encerramento.
 */
export function persistedStatusOf(state: CallSessionState): PersistedStatus | null {
  switch (state.status) {
    case 'idle':
      return null;
    case 'dialing':
    case 'ringing_out':
    case 'ringing_in':
      return 'ringing';
    case 'connecting':
    case 'active':
      return 'answered';
    case 'ending':
      return state.answeredAt === null ? 'ringing' : 'answered';
    case 'ended':
      return persistedStatusForEndReason(state.endReason);
  }
}

/**
 * Motivo de encerramento que o evento produziria neste estado — ou `null`
 * quando o evento não encerra a chamada aqui (isto é, transição inválida).
 */
export function endReasonFor(state: CallSessionState, event: CallSessionEvent): EndReason | null {
  switch (event.type) {
    case 'HANGUP_LOCAL':
      if (state.status === 'active') return 'completed';
      if (state.status === 'ending') return state.endReason ?? 'cancelled';
      return isPreAnswer(state.status) ? 'cancelled' : null;

    case 'HANGUP_REMOTE':
      if (state.status === 'active') return 'completed';
      if (state.status === 'ending') return state.endReason ?? 'no_answer';
      if (isPreAnswer(state.status)) {
        return event.code === undefined ? 'no_answer' : sipCodeToEndReason(event.code);
      }
      return null;

    case 'FAILED':
      // Depois de atendida, a falha é do próprio encerramento (`failed`),
      // não do código SIP que a derrubou.
      if (state.status === 'active') return 'failed';
      if (state.status === 'ending') return state.endReason ?? 'failed';
      return isPreAnswer(state.status) ? sipCodeToEndReason(event.code) : null;

    case 'REJECT':
      return state.status === 'ringing_in' ? 'declined' : null;

    case 'CANCEL_REMOTE':
      return state.status === 'ringing_in' ? 'cancelled_remote' : null;

    // TIMEOUT só é válido em ringing_in (Apêndice C / invariantes do plano).
    case 'TIMEOUT':
      return state.status === 'ringing_in' ? 'timeout' : null;

    default:
      return null;
  }
}

/**
 * Segunda chamada chegando com a sessão ocupada. A máquina devolve o estado
 * inalterado (sem warn) e o provider registra a nova chamada como `missed`
 * com motivo `busy_here` — ver `busyHereOutcome`.
 */
export function isBusyHere(state: CallSessionState, event: CallSessionEvent): boolean {
  return event.type === 'INVITE_RECEIVED' && state.status !== 'idle';
}

/** Resultado a persistir para a segunda chamada que chega com a linha ocupada. */
export function busyHereOutcome(): { persistedStatus: PersistedStatus; endReason: EndReason } {
  return { persistedStatus: 'missed', endReason: 'busy' };
}

/**
 * Reducer puro. Transição inválida → estado inalterado (mesma referência) +
 * `console.warn` com o sessionId. Nunca lança.
 */
export function reduce(state: CallSessionState, event: CallSessionEvent): CallSessionState {
  switch (event.type) {
    case 'DIAL': {
      if (state.status !== 'idle') return invalid(state, event);
      return {
        ...initialState(),
        status: 'dialing',
        sessionId: event.sessionId,
        direction: 'outbound',
        channel: event.channel ?? 'voip',
        phone: event.phone ?? null,
        name: event.name ?? null,
        startedAt: atOf(event),
      };
    }

    case 'INVITE_RECEIVED': {
      // Com a sessão ocupada a máquina não reage (não é transição inválida:
      // é a linha "qualquer ≠ idle" da tabela do Apêndice C). Sem warn.
      if (state.status !== 'idle') return state;
      return {
        ...initialState(),
        status: 'ringing_in',
        sessionId: event.sessionId,
        direction: 'inbound',
        channel: event.channel ?? 'voip',
        phone: event.phone ?? null,
        name: event.name ?? null,
        startedAt: atOf(event),
      };
    }

    case 'RINGING': {
      if (state.status !== 'dialing') return invalid(state, event);
      return { ...state, status: 'ringing_out' };
    }

    case 'ESTABLISHED': {
      if (!isPreAnswerOutgoing(state.status) && state.status !== 'connecting') return invalid(state, event);
      // `answeredAt` é definido AQUI e em nenhum outro lugar.
      return { ...state, status: 'active', answeredAt: atOf(event) };
    }

    case 'ACCEPT': {
      if (state.status !== 'ringing_in') return invalid(state, event);
      return { ...state, status: 'connecting' };
    }

    case 'HANGUP_LOCAL':
    case 'HANGUP_REMOTE':
    case 'FAILED':
    case 'REJECT':
    case 'CANCEL_REMOTE':
    case 'TIMEOUT': {
      const endReason = endReasonFor(state, event);
      if (endReason === null) return invalid(state, event);
      // Em `ending` o encerramento já estava decidido: preserva a origem
      // anterior para não reescrever o desfecho.
      const endedBy = state.status === 'ending' && state.endedBy !== null ? state.endedBy : ENDED_BY[event.type];
      return end(state, endReason, endedBy, atOf(event), sipCodeOf(event));
    }

    case 'RESET': {
      // RESET só a partir de ended → idle.
      if (state.status !== 'ended') return invalid(state, event);
      return initialState();
    }

    default: {
      // Exaustividade em tempo de compilação: se um evento novo entrar na
      // união sem `case`, esta linha deixa de compilar. Em runtime (JS puro,
      // payload de mensagem), cai em `invalid` → warn + estado inalterado.
      const naoTratado: never = event;
      return invalid(state, naoTratado);
    }
  }
}

/** Estados antes do atendimento local de uma chamada de saída. */
function isPreAnswer(status: CallSessionStatus): boolean {
  return status === 'dialing' || status === 'ringing_out' || status === 'connecting' || status === 'ending';
}

/** Estados de uma saída ainda não atendida (usado pelo ESTABLISHED). */
function isPreAnswerOutgoing(status: CallSessionStatus): boolean {
  return status === 'dialing' || status === 'ringing_out';
}

/** Aplica o encerramento preservando toda a identidade da sessão. */
function end(
  state: CallSessionState,
  endReason: EndReason,
  endedBy: EndedBy,
  at: number,
  sipCode: number | null,
): CallSessionState {
  return {
    ...state,
    status: 'ended',
    endReason,
    endedBy,
    endedAt: at,
    sipCode: sipCode ?? state.sipCode,
  };
}

/** Código SIP do evento, quando ele carrega um. */
function sipCodeOf(event: CallSessionEvent): number | null {
  switch (event.type) {
    case 'FAILED':
      return event.code;
    case 'HANGUP_REMOTE':
    case 'REJECT':
    case 'CANCEL_REMOTE':
      return event.code ?? null;
    default:
      return null;
  }
}

/** Epoch ms do evento; cai em `Date.now()` quando o provedor não manda `at`. */
function atOf(stamp: CallSessionEventStamp): number {
  return typeof stamp.at === 'number' && Number.isFinite(stamp.at) ? stamp.at : Date.now();
}

/** Transição inválida: avisa (com o sessionId) e devolve o mesmo estado. */
function invalid(state: CallSessionState, event: CallSessionEvent): CallSessionState {
  console.warn(
    `${INVALID_TRANSITION_PREFIX}: ${state.status} + ${event.type} (sessionId=${state.sessionId ?? 'null'})`,
  );
  return state;
}
