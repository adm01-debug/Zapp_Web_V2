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
import { useInRouterContext, useNavigate } from 'react-router-dom';

import { useSipClient } from '@/hooks/communication/useSipClient';
import type { EngineStatus } from '@/lib/calls/adapters/CallEngine';
import { uuidV4 } from '@/lib/calls/persistence';
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

/** Id da sessão: o uuid do banco quando existir; senão um uuid v4 local. */
function novoSessionId(callId: string | null): string {
  return callId || uuidV4();
}

/**
 * Ponte de navegação: registra o `navigate` do Router sem obrigar o provider a
 * estar dentro dele.
 *
 * Existe por um defeito real: `AppProviders` monta este provider **fora** do
 * `BrowserRouter` (`App.tsx:129-156`), então chamar `useNavigate()` no provider
 * derrubava a aplicação inteira — a página de login parava de renderizar e o
 * E2E pegou isso. O teste unitário não pegava porque ele mesmo fornecia o
 * `MemoryRouter` que o app não tem: o teste escondia a dependência que faltava.
 */
function PonteDeNavegacao({
  registrar,
}: {
  registrar: (navegar: (search: string) => void) => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    registrar((search) => {
      navigate({ search });
    });
  }, [navigate, registrar]);
  return null;
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const sip = useSipClient();
  const emRouter = useInRouterContext();
  const [session, dispatch] = useReducer(reduce, undefined, initialState);

  // Preenchido pela ponte quando (e só quando) há Router acima.
  const navegarRef = useRef<((search: string) => void) | null>(null);
  const registrarNavegador = useCallback((navegar: (search: string) => void) => {
    navegarRef.current = navegar;
  }, []);

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
    const navegar = navegarRef.current;
    if (navegar) {
      navegar(VOIP_VIEW_SEARCH);
      return;
    }
    // Sem Router acima: navega pelo histórico, que o `BrowserRouter` escuta via
    // popstate. Assim o dialer abre também no app como ele é montado hoje.
    const { pathname, hash } = window.location;
    window.history.pushState(null, '', `${pathname}${VOIP_VIEW_SEARCH}${hash}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const dial = useCallback(
    (phone: string) => {
      reiniciarSeTerminal();
      // T11: UM id por chamada — o mesmo uuid no evento `DIAL` (máquina), no
      // `sessionId` do evento e no `p_id` das 3 gravações do banco.
      const id = novoId();
      dispatch({ type: 'DIAL', sessionId: id, channel: 'voip', phone });
      openDialer();
      sip.makeCall(phone, id);
    },
    [openDialer, novoId, reiniciarSeTerminal, sip],
  );

  const accept = useCallback(async () => {
    // `ACCEPT` só vale a partir de `ringing_in` → `connecting`; sem ele o
    // `ESTABLISHED` seguinte (status `active` do motor) é transição inválida e a
    // chamada atendida nunca marca `answeredAt`. Despachado ANTES do await para
    // garantir a ordem mesmo quando o motor já emitiu `active` em microtask.
    if (estadoRef.current.status === 'ringing_in') dispatch({ type: 'ACCEPT' });
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
        // 2ª entrada depois de uma chamada terminal: sem o reset a máquina
        // segue `ended` e o INVITE_RECEIVED é engolido (sem warn) — a chamada
        // de entrada fica presa e nunca toca.
        reiniciarSeTerminal();
        dispatch({ type: 'INVITE_RECEIVED', sessionId: novoId(), channel: 'voip', phone });
      } else {
        dispatch({ type: 'RINGING' });
      }
    } else if (callStatus === 'active') dispatch({ type: 'ESTABLISHED' });
    else if (callStatus === 'ended' && !isTerminal(estadoRef.current.status)) {
      // Entrada ainda tocando que encerra SEM `reject()`: o lado remoto
      // cancelou/expirou. `HANGUP_LOCAL` é inválido a partir de `ringing_in`
      // (`isPreAnswer` não o inclui) e congelava a máquina para sempre.
      // `reject()` já despacha `REJECT` na hora, então chegar aqui com
      // `ringing_in` significa que foi o remoto.
      dispatch(
        estadoRef.current.status === 'ringing_in'
          ? { type: 'CANCEL_REMOTE' }
          : { type: 'HANGUP_LOCAL' },
      );
    }
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

  return (
    <CallSessionContext.Provider value={value}>
      {emRouter ? <PonteDeNavegacao registrar={registrarNavegador} /> : null}
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession(): CallSessionApi {
  const ctx = useContext(CallSessionContext);
  if (!ctx) throw new Error('useCallSession deve ser usado dentro de CallSessionProvider');
  return ctx;
}
