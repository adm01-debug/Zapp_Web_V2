/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
  type CallEndOutcome,
  type CallSessionEvent,
  type CallSessionState,
  type CallSessionStatus,
} from '@/lib/calls/session';
import { onStartCall, type StartCallPayload } from '@/lib/calls/events';

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
 * quem desligou) chega pelo `onEnd` do hook e é despachado por `despacharFim`
 * (T12), o ponto único de encerramento.
 *
 * T16/T17 fecharam três defeitos reais medidos: o `endedBy` COMPLETO agora vira
 * a ação certa da tabela (`eventoDeFim` — recusa vira `declined`, falha vira
 * `failed`), desligar uma entrada que ainda toca é `REJECT` (não o inválido
 * `HANGUP_LOCAL`) e o fim presumido do efeito de status (fraco) é corrigido pelo
 * `onEnd` real que chega depois (`corrigirFim`) em vez de engoli-lo.
 */

/** Rota da view de telefonia — o `ViewRouter` mapeia `voip` → `VoIPPanel`. */
export const VOIP_VIEW_SEARCH = '?view=voip';

/**
 * T21 — TTL do toque de uma chamada de ENTRADA: quanto tempo ela toca antes de
 * a MÁQUINA encerrar sozinha por `TIMEOUT` (`ringing_in` → `timeout`).
 *
 * Antes esse relógio era um `setTimeout(dismissCall, 30_000)` na UI
 * (`IncomingCallAlert`): quem decidia o fim da chamada era a tela. Aqui a
 * decisão volta para a máquina de sessão, que já sabe persistir e rotular o
 * desfecho (`END_REASON_LABEL.timeout`).
 */
export const RING_TIMEOUT_MS = 30_000;

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
  /**
   * Numero que o clique-para-discar deixou no discador sem discar (T29).
   * `null` quando nao ha pedido pendente.
   */
  numeroPendente: string | null;
};

const CallSessionContext = createContext<CallSessionApi | undefined>(undefined);

/** Id da sessão: o uuid do banco quando existir; senão um uuid v4 local. */
function novoSessionId(callId: string | null): string {
  return callId || uuidV4();
}

/**
 * Código do evento `FAILED` quando o fim não trouxe código SIP. O reducer exige
 * um número; `sipCodeToEndReason(0)` cai no ramo dos 5xx/desconhecidos, que é
 * exatamente o motivo `failed` de um desfecho `failure` sem código.
 */
const SEM_CODIGO_SIP = 0;

/**
 * T16 (D5) — a ação da máquina que representa o desfecho REAL do motor,
 * respeitando a tabela de transições válidas de `session.ts` (`endReasonFor`).
 *
 * Antes, todo desfecho que não fosse `hangup_local` virava `HANGUP_REMOTE`:
 * uma recusa (`{endedBy:'reject'}`, 603) fechava como "Cancelada por quem
 * ligou" e uma falha técnica (`{endedBy:'failure'}`) como "Encerrada pelo outro
 * lado". Cada ação abaixo reproduz o motivo que `desfechoDaChamada`
 * (persistência) grava para o MESMO desfecho — sessão e banco contam a mesma
 * história.
 *
 * Quando a ação fiel não existe no estado atual, vale o equivalente VÁLIDO
 * (um dispatch inválido só renderia warn e deixaria o estado preso). Devolve
 * `null` quando não há o que encerrar (sessão ociosa), sem warn.
 */
function eventoDeFim(outcome: CallEndOutcome, status: CallSessionStatus): CallSessionEvent | null {
  const code = outcome.sipCode ?? undefined;

  if (status === 'ringing_in') {
    // Entrada ainda tocando: `HANGUP_LOCAL`/`HANGUP_REMOTE`/`FAILED` são
    // inválidos nesta linha da tabela; só REJECT/CANCEL_REMOTE/TIMEOUT fecham.
    if (outcome.endedBy === 'reject' || outcome.endedBy === 'hangup_local') {
      // `hangup_local` aqui é desligar a entrada que toca = recusar (D6).
      return { type: 'REJECT', code };
    }
    if (outcome.endedBy === 'timeout') return { type: 'TIMEOUT' };
    // hangup_remote, cancel_remote e failure: o remoto (ou a operadora) encerrou.
    return { type: 'CANCEL_REMOTE', code };
  }

  if (status === 'active' || status === 'ending') {
    // Atendida: o motivo diz QUEM encerrou — mesma regra de `motivoAtendida`.
    if (outcome.endedBy === 'failure') return { type: 'FAILED', code: outcome.sipCode ?? SEM_CODIGO_SIP };
    if (outcome.endedBy === 'hangup_remote') return { type: 'HANGUP_REMOTE', code };
    return { type: 'HANGUP_LOCAL' };
  }

  if (status === 'dialing' || status === 'ringing_out' || status === 'connecting') {
    if (outcome.endedBy === 'failure') return { type: 'FAILED', code: outcome.sipCode ?? SEM_CODIGO_SIP };
    if (outcome.endedBy === 'hangup_local') return { type: 'HANGUP_LOCAL' };
    // Saída antes de atendida: reject/cancel_remote/timeout não têm ação própria
    // aqui — o fim remoto é `HANGUP_REMOTE` e o código SIP decide o motivo fino
    // (487 → cancelada, 603 → recusada, 486 → ocupado, sem código → não atendida).
    return { type: 'HANGUP_REMOTE', code };
  }

  return null; // idle: nada a encerrar
}

/** Carimba o evento com o instante original (o `at` é opcional no contrato). */
function comCarimbo(evento: CallSessionEvent, at: number | null): CallSessionEvent {
  // O spread sobre a união preserva o `type` de cada membro; o cast só recompõe
  // a união para o TS (o runtime aceita `at` em todos os eventos).
  return at === null ? evento : ({ ...evento, at } as CallSessionEvent);
}

/**
 * T17 (D8) — faz o desfecho REAL prevalecer sobre o fim FRACO que o efeito de
 * status despacha por padrão (`{endedBy:'hangup_remote', sipCode:null}`).
 *
 * O motor fecha `callStatus` antes de entregar o `onEnd` (a ordem está sendo
 * corrigida na origem, no `CallEngine`), então a sessão pode já estar `ended`
 * com um desfecho presumido: um 486 do SIP virava "não atendida" para sempre,
 * porque a guarda de terminal descartava o `onEnd` real que chegava depois.
 *
 * A máquina só aceita RESET a partir de `ended`, então a correção reconstrói a
 * sessão — mesmo id/direção/canal/telefone e os MESMOS carimbos de tempo, que
 * viajam no `at` dos eventos — e só então despacha o fim verdadeiro.
 */
function corrigirFim(
  atual: CallSessionState,
  outcome: CallEndOutcome,
  despachar: (event: CallSessionEvent) => void,
): void {
  const { sessionId, direction, channel, phone, startedAt, answeredAt, endedAt } = atual;
  // Sem identidade não há o que reconstruir — nunca acontece com uma sessão que
  // chegou a `ended` (só RESET zera o id, e RESET só parte de `ended`).
  if (sessionId === null || direction === null) return;

  despachar({ type: 'RESET' });
  despachar(comCarimbo(
    direction === 'inbound'
      ? { type: 'INVITE_RECEIVED', sessionId, channel, phone: phone ?? undefined }
      : { type: 'DIAL', sessionId, channel, phone: phone ?? undefined },
    startedAt,
  ));
  if (answeredAt !== null) {
    // Entrada atendida: `ESTABLISHED` só é válido de `connecting`.
    if (direction === 'inbound') despachar({ type: 'ACCEPT' });
    despachar(comCarimbo({ type: 'ESTABLISHED' }, answeredAt));
  }

  const statusReconstruido: CallSessionStatus = answeredAt !== null
    ? 'active'
    : direction === 'inbound' ? 'ringing_in' : 'dialing';
  const fim = eventoDeFim(outcome, statusReconstruido);
  if (fim !== null) despachar(comCarimbo(fim, endedAt));
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
      // Fonte única de navegação: o dialer navega via react-router, mas o
      // useNavigationHistory (ActiveCallBar/Index) precisa acompanhar pelo
      // evento `zapp:navigate` — senão a barra não some na tela de Telefonia.
      const view = new URLSearchParams(search).get('view');
      if (view) {
        window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view } }));
      }
    });
  }, [navigate, registrar]);
  return null;
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const emRouter = useInRouterContext();
  const [session, dispatch] = useReducer(reduce, undefined, initialState);

  // Espelho do estado para o efeito decidir sem virar dependência (e sem
  // closure velha): o estado muda a cada evento, o status do motor não.
  // Fica ANTES do hook de SIP porque o `despacharFim` (T12) lê daqui.
  const estadoRef = useRef(session);
  useEffect(() => {
    estadoRef.current = session;
  }, [session]);

  /**
   * T21 — o TTL do toque vive na MÁQUINA, não na UI.
   *
   * Enquanto a sessão está em `ringing_in`, arma o relógio do toque; ao expirar,
   * despacha `TIMEOUT`, que a máquina aceita só a partir de `ringing_in` e fecha
   * a sessão em `ended`/`endReason: 'timeout'` (e o restante do ciclo persiste).
   *
   * Cancelamento: o cleanup roda quando o status deixa de ser `ringing_in`
   * (atendeu, recusou, o remoto cancelou) **e** no unmount — nenhum timer vaza e
   * nenhum dispatch acontece depois de o provider sumir. A guarda `estadoRef`
   * dentro do callback é a segunda linha de defesa: mesmo que algo escapasse ao
   * cleanup, o `TIMEOUT` NÃO é despachado fora de `ringing_in` (não dependemos
   * da rejeição da máquina).
   *
   * Depender de `session.status` (e não de `session`) mantém o mesmo timer vivo
   * por todo o toque: eventos do motor não o reiniciam.
   */
  useEffect(() => {
    if (session.status !== 'ringing_in') return;
    const timer = setTimeout(() => {
      if (estadoRef.current.status !== 'ringing_in') return;
      dispatch({ type: 'TIMEOUT' });
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session.status]);

  /**
   * T17 (D8): `true` enquanto o estado terminal veio do fim FRACO (o default do
   * efeito de status) — e não de um desfecho real do motor nem de uma ação do
   * usuário. Só um fim fraco pode ser corrigido por um `onEnd` que chegue depois.
   */
  const fimFracoRef = useRef(false);

  /**
   * Fim da chamada (T12): PONTO ÚNICO de despacho do encerramento, usado pelo
   * callback `onEnd` do hook E pelo ramo `ended` do efeito de status. A guarda
   * `!isTerminal` garante um só dispatch — e nenhum warn de transição inválida
   * quando as duas fontes chegam (hangup local já fecha o estado na hora).
   *
   * `fraco` (T17/D8) marca o fim PRESUMIDO do efeito de status: sem desfecho
   * real do motor, ele fecha a sessão como remoto sem código. Um `onEnd`
   * verdadeiro que chegue depois derruba esse fim fraco; um fim já decidido por
   * ação do usuário (ou por um `onEnd` anterior) nunca é reescrito.
   */
  const despacharFim = useCallback((outcome: CallEndOutcome, fraco = false) => {
    const atual = estadoRef.current;
    if (isTerminal(atual.status)) {
      if (!fimFracoRef.current) return;
      // Mesmo desfecho: nada a corrigir (e nada a re-despachar).
      if (atual.endedBy === outcome.endedBy && atual.sipCode === outcome.sipCode) return;
      corrigirFim(atual, outcome, dispatch);
      fimFracoRef.current = false;
      return;
    }
    const evento = eventoDeFim(outcome, atual.status);
    if (evento === null) return; // sessão ociosa: nada a encerrar (e sem warn)
    dispatch(evento);
    fimFracoRef.current = fraco;
  }, []);

  const sip = useSipClient(despacharFim);

  // Preenchido pela ponte quando (e só quando) há Router acima.
  const navegarRef = useRef<((search: string) => void) | null>(null);
  const registrarNavegador = useCallback((navegar: (search: string) => void) => {
    navegarRef.current = navegar;
  }, []);

  const novoId = useCallback(() => novoSessionId(sip.currentCallId ?? null), [sip.currentCallId]);

  /** Uma sessão terminada só aceita RESET; toda nova chamada passa por aqui. */
  const reiniciarSeTerminal = useCallback(() => {
    if (isTerminal(estadoRef.current.status)) {
      dispatch({ type: 'RESET' });
      fimFracoRef.current = false;
    }
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
    async (phone: string) => {
      // T17: o microfone é conferido ANTES do `DIAL`. Despachar primeiro e
      // falhar depois deixaria a máquina presa em `dialing` — nada a encerraria,
      // e o agente ficaria com uma chamada fantasma na tela.
      if (!(await sip.garantirMicrofone())) return;
      reiniciarSeTerminal();
      // T11: UM id por chamada — o mesmo uuid no evento `DIAL` (máquina), no
      // `sessionId` do evento e no `p_id` das 3 gravações do banco.
      const id = novoId();
      dispatch({ type: 'DIAL', sessionId: id, channel: 'voip', phone });
      openDialer();
      await sip.makeCall(phone, id);
    },
    [openDialer, novoId, reiniciarSeTerminal, sip],
  );

  const [numeroPendente, setNumeroPendente] = useState<string | null>(null);

  /**
   * T29 - UNICO consumidor do clique-para-discar. Quem pede a ligacao
   * (`ContactActionButtons`, `ContactHeaderSection`, `ChatHeader`) so emite
   * `zapp:start-call`; o que fazer com o pedido e decidido aqui, num lugar so.
   *
   * `autoDial` ausente/falso (o padrao do contrato) NAO disca: guarda o numero e
   * abre `?view=voip` - quem aperta o botao do painel e o agente. `autoDial:true`
   * (botao "Ligar de volta" do historico) disca direto.
   */
  useEffect(() => {
    return onStartCall((pedido: StartCallPayload) => {
      setNumeroPendente(pedido.phone);
      if (pedido.autoDial) {
        void dial(pedido.phone);
        return;
      }
      openDialer();
    });
  }, [dial, openDialer]);

  const accept = useCallback(async () => {
    // `ACCEPT` só vale a partir de `ringing_in` → `connecting`; sem ele o
    // `ESTABLISHED` seguinte (status `active` do motor) é transição inválida e a
    // chamada atendida nunca marca `answeredAt`. Despachado ANTES do await para
    // garantir a ordem mesmo quando o motor já emitiu `active` em microtask.
    if (estadoRef.current.status === 'ringing_in') dispatch({ type: 'ACCEPT' });
    await sip.acceptIncomingCall();
  }, [sip]);

  const reject = useCallback(async () => {
    if (!isTerminal(estadoRef.current.status)) {
      dispatch({ type: 'REJECT' });
      fimFracoRef.current = false;
    }
    await sip.rejectIncomingCall();
  }, [sip]);

  const hangup = useCallback(() => {
    const atual = estadoRef.current;
    if (!isTerminal(atual.status)) {
      // T16 (D6): desligar uma ENTRADA que ainda toca é RECUSAR — `HANGUP_LOCAL`
      // é inválido a partir de `ringing_in` (a máquina só loga warn e a chamada
      // fica presa); `REJECT` fecha em `declined`, que é o que de fato aconteceu.
      dispatch(atual.status === 'ringing_in' ? { type: 'REJECT' } : { type: 'HANGUP_LOCAL' });
      fimFracoRef.current = false;
    }
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
    else if (callStatus === 'ended') {
      // T12: o fim chega primeiro pelo `onEnd` do hook, que traz o desfecho
      // fino (quem encerrou + código SIP). CHEGAR AQUI com o estado ainda aberto
      // significa que o encerramento veio do outro lado: quando VOCÊ desliga é
      // `hangup()`, que já fecha o estado na hora e cai na guarda do helper.
      // T17 (D8): este é o fim FRACO (remoto presumido, sem código) — se o
      // `onEnd` real chegar depois, ele prevalece e corrige a sessão.
      despacharFim({ endedBy: 'hangup_remote', sipCode: null }, true);
    }
  }, [sip, novoId, reiniciarSeTerminal, despacharFim]);

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
      numeroPendente,
    }),
    [sip, session, dial, accept, reject, hangup, openDialer, numeroPendente],
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
