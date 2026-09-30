/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { useSipClient } from '@/hooks/communication/useSipClient';
import type { EngineStatus } from '@/lib/calls/adapters/CallEngine';
import {
  initialState,
  isTerminal,
  reduce,
  type CallSessionEvent,
  type CallSessionState,
} from '@/lib/calls/session';

/**
 * T10 — o provider ganha a máquina de estados canônica (`src/lib/calls/session.ts`).
 *
 * Até o T09 ele era 22 linhas que só embrulhavam o `useSipClient()` num contexto,
 * e o `reduce()` do módulo de sessão tinha **zero consumidores**. Agora o estado
 * da chamada É o `reduce()`, e a API é a do plano:
 * `dial/accept/reject/hangup/toggleMute/sendDTMF/openDialer`.
 *
 * Compatibilidade (o que o aceite exige antes da Fase 4): a UI antiga
 * (`VoIPPanel`, `DialPad`, `ActiveCallBar`) lê `useCallSession()`, então o valor
 * continua trazendo **todos** os campos do `useSipClient()` — `sipStatus`,
 * `callStatus`, `callDuration`, `isMuted`, `currentNumber`, `callDirection`,
 * `currentCallId` — e ganha `session` + a API nova por cima. Nenhum campo
 * existente foi removido nem mudou de forma.
 *
 * Quem dirige a máquina: o status observado do motor (fonte única). Os eventos
 * de encerramento por ação do usuário (`hangup`/`reject`) são despachados na
 * hora, para preservar o `endedBy` correto — e o efeito não repete o
 * encerramento quando o estado já é terminal. O `end_reason` fino (código SIP,
 * quem desligou) é o T12.
 */

/** Rota da view de telefonia — o `ViewRouter` mapeia `voip` → `VoIPPanel`. */
export const VOIP_VIEW_SEARCH = '?view=voip';

export type CallSessionApi = ReturnType<typeof useSipClient> & {
  /** Estado da sessão (máquina de `session.ts`). */
  session: CallSessionState;
  /** Despacho cru, para as fases seguintes (T11/T12) reagirem ao mesmo estado. */
  dispatch: (event: CallSessionEvent) => void;
  /** Id da sessão corrente (o mesmo de `DIAL`/`INVITE_RECEIVED`). */
  sessionId: string | null;
  dial: (phone: string) => void;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  hangup: () => void;
  openDialer: () => void;
};

const CallSessionContext = createContext<CallSessionApi | undefined>(undefined);

let contadorLocal = 0;

/** Id da sessão: o uuid do banco quando existir; senão um local estável. */
function novoSessionId(callId: string | null): string {
  if (callId) return callId;
  const aleatorio = globalThis.crypto?.randomUUID?.();
  if (aleatorio) return aleatorio;
  contadorLocal += 1;
  return `local-${Date.now()}-${contadorLocal}`;
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const sip = useSipClient();
  const navigate = useNavigate();
  const [session, dispatch] = useReducer(reduce, undefined, initialState);

  // Espelho do estado para o efeito decidir sem virar dependência (e sem
  // closure velha): o estado muda a cada evento, o status do motor não.
  const estadoRef = useRef(session);
  useEffect(() => {
    estadoRef.current = session;
  }, [session]);

  const novoId = useCallback(() => novoSessionId(sip.currentCallId ?? null), [sip.currentCallId]);

  /** Uma sessão terminada só aceita RESET; toda nova chamada passa por aqui. */
  const reiniciarSeTerminal = useCallback(() => {
    if (isTerminal(estadoRef.current.status)) dispatch({ type: 'RESET' });
  }, []);

  const openDialer = useCallback(() => {
    navigate({ search: VOIP_VIEW_SEARCH });
  }, [navigate]);

  const dial = useCallback(
    (phone: string) => {
      reiniciarSeTerminal();
      dispatch({ type: 'DIAL', sessionId: novoId(), channel: 'voip', phone });
      openDialer();
      sip.makeCall(phone);
    },
    [openDialer, novoId, reiniciarSeTerminal, sip],
  );

  const accept = useCallback(async () => {
    await sip.acceptIncomingCall();
  }, [sip]);

  const reject = useCallback(async () => {
    if (!isTerminal(estadoRef.current.status)) dispatch({ type: 'REJECT' });
    await sip.rejectIncomingCall();
  }, [sip]);

  const hangup = useCallback(() => {
    if (!isTerminal(estadoRef.current.status)) dispatch({ type: 'HANGUP_LOCAL' });
    sip.hangUp();
  }, [sip]);

  // A máquina segue o status do motor. `HANGUP_LOCAL` só entra se o estado
  // ainda não é terminal — assim `hangup()`/`reject()` preservam o `endedBy`
  // real e não há transição inválida por evento duplicado.
  const statusAnteriorRef = useRef<EngineStatus | null>(null);
  useEffect(() => {
    const { callStatus, callDirection, currentNumber } = sip;
    if (callStatus === statusAnteriorRef.current) return;
    statusAnteriorRef.current = callStatus;

    const phone = currentNumber || undefined;
    if (callStatus === 'calling') {
      reiniciarSeTerminal();
      dispatch({
        type: callDirection === 'inbound' ? 'INVITE_RECEIVED' : 'DIAL',
        sessionId: novoId(),
        channel: 'voip',
        phone,
      });
      return;
    }
    if (callStatus === 'ringing') {
      if (callDirection === 'inbound') {
        dispatch({ type: 'INVITE_RECEIVED', sessionId: novoId(), channel: 'voip', phone });
      } else {
        dispatch({ type: 'RINGING' });
      }
    } else if (callStatus === 'active') dispatch({ type: 'ESTABLISHED' });
    else if (callStatus === 'ended' && !isTerminal(estadoRef.current.status)) dispatch({ type: 'HANGUP_LOCAL' });
  }, [sip, novoId, reiniciarSeTerminal]);

  const value = useMemo<CallSessionApi>(
    () => ({
      // Campos do hook primeiro: a UI antiga continua vendo exatamente o que via.
      ...sip,
      session,
      dispatch,
      sessionId: session.sessionId,
      dial,
      accept,
      reject,
      hangup,
      openDialer,
    }),
    [sip, session, dial, accept, reject, hangup, openDialer],
  );

  return <CallSessionContext.Provider value={value}>{children}</CallSessionContext.Provider>;
}

export function useCallSession(): CallSessionApi {
  const ctx = useContext(CallSessionContext);
  if (!ctx) throw new Error('useCallSession deve ser usado dentro de CallSessionProvider');
  return ctx;
}
