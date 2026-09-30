/**
 * Motor de sessão de chamada — etapa T09 do plano de finalização.
 *
 * Este é o "resto" de `useSipClient.ts` que não era React: bookkeeping da
 * sessão corrente, cronômetro de resposta, registro no banco e as ações
 * (discar/atender/recusar/desligar/mute/DTMF). Foi **movido**, não reescrito —
 * mesmas ordens e mesmos guards do hook original; o que mudou é que o estado
 * sai por um `CallEngineSink` em vez de `useState`, e o transporte entra pelo
 * `CallAdapter` em vez de `sip.js` direto.
 *
 * Consequência: sem React aqui, o ciclo inteiro é testável com um adapter falso
 * — o que o T85 vai cobrar. O T10 troca o punhado de campos abaixo pelo
 * `reduce()` de `src/lib/calls/session.ts`, mantendo esta API.
 *
 * Sem import de valor de `sip.js` nem de `@/lib/logger`: o log e o toast
 * chegam pelo sink, para o módulo continuar sem dependência de UI.
 */

import type { Invitation, Session, UserAgent } from 'sip.js';

import type { CallEndOutcome } from '../callStatus';
import type { AdapterDirection, CallAdapter } from './CallAdapter';

/** Estados do ciclo de vida, iguais aos que a UI do T09 já consumia. */
export type EngineStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

export interface CreateCallParams {
  contactId?: string;
  contactPhone: string;
  contactName: string;
  direction: AdapterDirection;
  /** Id da sessão no front (= `sessionId` da máquina); vira o `p_id` da linha. */
  sessionId?: string;
  /** Call-ID do SIP (`Session.id`) — prova da sessão no provedor. */
  providerCallId?: string;
}

/** Saídas do motor: tudo o que precisa de React, de toast ou de banco. */
export interface CallEngineSink {
  onStatus(status: EngineStatus): void;
  onSession(direction: AdapterDirection | null, number: string): void;
  /** Atendida — o consumidor zera e liga o cronômetro. */
  onEstablished(): void;
  /** Encerrada — o consumidor para o cronômetro. */
  onTerminated(): void;
  onMuted(muted: boolean): void;
  onError(message: string): void;
  /** Cria o registro da chamada e devolve o id (ou null em falha). */
  create(params: CreateCallParams): Promise<string | null>;
  onAnswered(callId: string): void;
  /** `talkSeconds` null = não atendida. `outcome` = quem encerrou + código SIP (T12). */
  onFinished(callId: string, talkSeconds: number | null, outcome: CallEndOutcome): void;
}

/** Quanto tempo o desfecho fica na tela antes de voltar para `idle`. */
const IDLE_RESET_MS = 2000;

/** Sink inerte: permite construir o motor antes de ter os callbacks do React. */
const NOOP_SINK: CallEngineSink = {
  onStatus: () => undefined,
  onSession: () => undefined,
  onEstablished: () => undefined,
  onTerminated: () => undefined,
  onMuted: () => undefined,
  onError: () => undefined,
  create: async () => null,
  onAnswered: () => undefined,
  onFinished: () => undefined,
};

export class CallEngine {
  private sink: CallEngineSink;
  private session: Session | null = null;
  private invitation: Invitation | null = null;
  private answeredAt: Date | null = null;
  // Promise (não valor síncrono) porque o registro no banco começa em paralelo
  // com o convite SIP — Estabelecida/Terminada podem chegar antes de resolver.
  private callIdPromise: Promise<string | null> | null = null;
  private status: EngineStatus = 'idle';
  private direction: AdapterDirection | null = null;
  private muted = false;
  // T12: desfecho fino da chamada corrente. `sipCode` é escrito pelo callback
  // `onReject` do INVITE (antes do Terminated); as bandeiras dizem se o fim
  // partiu de uma ação nossa. Todas zeradas no início de cada chamada.
  private sipCode: number | null = null;
  private localHangup = false;
  private localReject = false;
  private idleResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly adapter: CallAdapter,
    sink: CallEngineSink = NOOP_SINK,
  ) {
    this.sink = sink;
  }

  /** Rebinda o sink a cada render (o consumidor recria os callbacks). */
  bind(sink: CallEngineSink): void {
    this.sink = sink;
  }

  /** `true` quando há chamada em curso — o guard de "já existe uma". */
  get isBusy(): boolean {
    return this.status !== 'idle';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Convite SIP recebido (delegate do UserAgent). */
  handleInvitation(invitation: Invitation): void {
    if (this.status !== 'idle') {
      // Linha ocupada: recusa com 486 e não toca a sessão corrente.
      void this.adapter.reject(invitation, 486);
      return;
    }

    const remoteUser = this.adapter.remoteNumberOf(invitation);
    this.invitation = invitation;
    this.answeredAt = null;
    this.direction = 'inbound';
    // Bandeira velha não pode vazar para esta chamada (T12).
    this.sipCode = null;
    this.localHangup = false;
    this.localReject = false;
    this.setStatus('ringing');
    this.sink.onSession('inbound', remoteUser);

    invitation.stateChange.addListener((state) => {
      this.handleStateChange(state, invitation, remoteUser, 'inbound');
    });

    this.callIdPromise = this.sink.create({
      contactPhone: remoteUser,
      contactName: '',
      direction: 'inbound',
      // `Invitation` estende `Session`: `id` é o Call-ID do convite.
      providerCallId: invitation.id,
    });
  }

  /** Transição de estado do sip.js (Establishing/Established/Terminated). */
  handleStateChange(state: string, session: Session, number: string, direction: AdapterDirection): void {
    if (state === 'Establishing') {
      this.setStatus('ringing');
      return;
    }

    if (state === 'Established') {
      this.answeredAt = new Date();
      this.setStatus('active');
      this.sink.onEstablished();
      void this.callIdPromise?.then((id) => { if (id) this.sink.onAnswered(id); });
      this.adapter.attachRemoteAudio(session);
      return;
    }

    if (state === 'Terminated') {
      const answeredAt = this.answeredAt;
      // T12: o desfecho fino é montado AQUI, antes de zerar a sessão. O
      // `sipCode` já está preenchido (o `onReject` do INVITE roda antes do
      // Terminated) e as bandeiras dizem se o fim partiu de uma ação nossa.
      const outcome: CallEndOutcome = {
        endedBy: this.localReject ? 'reject' : this.localHangup ? 'hangup_local' : 'hangup_remote',
        sipCode: this.sipCode,
      };
      this.setStatus('ended');
      this.sink.onTerminated();
      if (this.muted) { this.muted = false; this.sink.onMuted(false); }

      void this.callIdPromise?.then((id) => {
        if (!id) return;
        const talkSeconds = answeredAt
          ? Math.max(0, Math.round((Date.now() - answeredAt.getTime()) / 1000))
          : null;
        this.sink.onFinished(id, talkSeconds, outcome);
      });

      this.answeredAt = null;
      this.callIdPromise = null;
      this.session = null;
      if (direction === 'inbound') this.invitation = null;

      this.clearIdleReset();
      this.idleResetTimer = setTimeout(() => {
        this.idleResetTimer = null;
        this.setStatus('idle');
        this.direction = null;
        this.sink.onSession(null, '');
      }, IDLE_RESET_MS);
    }
  }

  async makeCall(number: string, ua: UserAgent | null, registered: boolean, sessionId?: string): Promise<void> {
    if (!ua || !registered) { this.sink.onError('VoIP não conectado.'); return; }
    if (this.status !== 'idle') { this.sink.onError('Já existe uma chamada em andamento.'); return; }
    try {
      if (!await this.adapter.isDialable(ua, number)) { this.sink.onError('Número inválido'); return; }
      // O carregamento de sip.js é assíncrono: recheca para não abrir duas.
      if (this.status !== 'idle') { this.sink.onError('Já existe uma chamada em andamento.'); return; }

      this.answeredAt = null;
      this.direction = 'outbound';
      // T12: esta chamada começa com o desfecho limpo (bandeira velha não vaza).
      this.sipCode = null;
      this.localHangup = false;
      this.localReject = false;
      this.setStatus('calling');
      this.sink.onSession('outbound', number);

      // O Inviter vem ANTES do registro: é dele o Call-ID que vai para
      // `provider_call_id` (T11). O import do sip.js é dinâmico, por isso a ordem
      // real só se prova aqui dentro.
      const inviter = await this.adapter.createInviter(ua, number);
      // Atribuído antes do invite() para que hangUp() encontre a sessão mesmo
      // com o INVITE ainda pendente (evita ligação órfã em cancelamento rápido).
      this.session = inviter;
      inviter.stateChange.addListener((state) => this.handleStateChange(state, inviter, number, 'outbound'));

      // Não bloqueia a discagem: o registro roda em paralelo com o convite SIP.
      this.callIdPromise = this.sink.create({
        contactPhone: number,
        contactName: '',
        direction: 'outbound',
        sessionId,
        providerCallId: inviter.id,
      });

      await this.adapter.invite(inviter, (statusCode) => { this.sipCode = statusCode ?? null; });
    } catch (error: unknown) {
      // Falha do próprio discar (transporte/URI): o desfecho é `failure`, sem
      // código SIP — o Terminated pode nunca chegar neste caminho.
      void this.callIdPromise?.then((id) => { if (id) this.sink.onFinished(id, null, { endedBy: 'failure', sipCode: null }); });
      this.callIdPromise = null;
      this.session = null;
      this.setStatus('idle');
      this.direction = null;
      this.sink.onSession(null, '');
      this.sink.onError(`Erro ao ligar: ${error instanceof Error ? error.message : 'Falha'}`);
    }
  }

  async accept(): Promise<void> {
    const invitation = this.invitation;
    if (!invitation) return;
    try {
      await this.adapter.accept(invitation);
      this.session = invitation;
    } catch {
      this.sink.onError('Erro ao atender a chamada.');
    }
  }

  async reject(): Promise<void> {
    const invitation = this.invitation;
    if (!invitation) return;
    // T12: a recusa é AÇÃO nossa — o Terminated seguinte é `reject`, não um
    // encerramento remoto.
    this.localReject = true;
    await this.adapter.reject(invitation);
  }

  /**
   * Não força `idle`: o listener de Terminated é a única fonte de verdade
   * sobre o resultado final (atendida/perdida) e a duração.
   */
  hangUp(): void {
    const session = this.session;
    if (session) {
      // A bandeira vem ANTES do adapter: o Terminated pode chegar durante o
      // `bye()`/`cancel()` e, sem ela, o fim pareceria remoto (T12).
      this.localHangup = true;
      this.adapter.hangup(session, this.direction ?? 'outbound');
      return;
    }
    if (this.invitation && this.status === 'ringing') void this.reject();
  }

  toggleMute(): void {
    if (!this.session) return;
    // O estado de verdade é o das tracks (o adapter devolve o que leu); sem
    // mídia (`null`) vale a intenção, para o botão não travar na UI.
    const muted = this.adapter.setMuted(this.session, !this.muted) ?? !this.muted;
    this.muted = muted;
    this.sink.onMuted(muted);
  }

  sendDTMF(digit: string): void {
    if (!this.session) return;
    // O guarda de "só estabelecida" (com warn) mora no adapter, que conhece a
    // sessão; aqui não se duplica para a regra ter um dono só.
    this.adapter.sendDTMF(this.session, digit);
  }

  /** Descarta timers, referências e o áudio remoto (unmount). */
  dispose(): void {
    this.clearIdleReset();
    this.adapter.disposeRemoteAudio();
    this.session = null;
    this.invitation = null;
    this.callIdPromise = null;
    this.answeredAt = null;
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.sink.onStatus(status);
  }

  private clearIdleReset(): void {
    if (this.idleResetTimer) {
      clearTimeout(this.idleResetTimer);
      this.idleResetTimer = null;
    }
  }
}
