/**
 * Implementação SIP do `CallAdapter` — etapa T09 do plano de finalização.
 *
 * Regra desta etapa: **mover**, não reescrever. Cada método abaixo faz o que o
 * bloco equivalente de `useSipClient.ts` fazia (mesmas opções de
 * `sessionDescriptionHandler`, mesma ordem de `getRemoteAudio` → `srcObject`,
 * mesmos guards), só que fora do React e com o resultado devolvido em vez de
 * jogado direto no estado.
 *
 * `sip.js` continua em `import()` dinâmico: a lib (e o vendor chunk dela) só
 * desce quando a chamada realmente acontece.
 */

import type { Invitation, Inviter, Session, UserAgent } from 'sip.js';

import type { AdapterDirection, AdapterLogger, CallAdapter } from './CallAdapter';

/** Id do elemento de áudio remoto — um por página, reaproveitado. */
export const REMOTE_AUDIO_ID = 'sip-remote-audio';

/** Opções de mídia do convite: só áudio, nunca vídeo. */
const MEDIA_CONSTRAINTS = { constraints: { audio: true, video: false } } as const;

/**
 * Fatia do `SessionDescriptionHandler` que este adapter usa. Tipar localmente
 * evita depender do namespace `Web` do sip.js e deixa o cast explícito.
 */
interface SdhLike {
  peerConnection?: RTCPeerConnection;
}

/**
 * Fatia das opções do `SessionDescriptionHandler` que este adapter usa. Tipar
 * localmente evita depender do namespace `Web` do sip.js: o tipo do `api` só
 * declara `constraints` (`node_modules/sip.js/lib/api/session-description-handler.d.ts:67-69`)
 * e `hold` vive no `platform/web`.
 */
interface OpcoesDeMidia {
  constraints?: object;
  /** `true` = direção `sendonly` (espera); `false` = `sendrecv`. */
  hold?: boolean;
}

function handlerOf(session: Session): SdhLike | undefined {
  return session.sessionDescriptionHandler as SdhLike | undefined;
}

export class SipCallAdapter implements CallAdapter {
  private remoteAudio: HTMLAudioElement | null = null;

  constructor(private readonly logger?: AdapterLogger) {}

  hostOf(ua: UserAgent): string {
    return ua.configuration.uri.host;
  }

  async isDialable(ua: UserAgent, number: string): Promise<boolean> {
    const { UserAgent: SipUserAgent } = await import('sip.js');
    return Boolean(SipUserAgent.makeURI(`sip:${number}@${this.hostOf(ua)}`));
  }

  async createInviter(ua: UserAgent, number: string): Promise<Inviter> {
    const { UserAgent: SipUserAgent, Inviter } = await import('sip.js');
    const target = SipUserAgent.makeURI(`sip:${number}@${this.hostOf(ua)}`);
    if (!target) throw new Error(`URI SIP inválida para ${number}`);
    return new Inviter(ua, target, { sessionDescriptionHandlerOptions: MEDIA_CONSTRAINTS });
  }

  async invite(inviter: Inviter, onFinalReject?: (statusCode: number | undefined) => void): Promise<void> {
    // O código SIP final NÃO fica no `Inviter` (sip.js 0.21 não expõe
    // `lastResponse`): ele só passa pelo delegate da transação — `onReject`
    // recebe a resposta 4xx/5xx/6xx e o número está em `response.message`.
    await inviter.invite({
      requestDelegate: {
        onReject: (response) => onFinalReject?.(response.message.statusCode),
      },
    });
  }

  remoteNumberOf(session: Session): string {
    return session.remoteIdentity?.uri?.user || 'desconhecido';
  }

  async accept(invitation: Invitation): Promise<void> {
    await invitation.accept({ sessionDescriptionHandlerOptions: MEDIA_CONSTRAINTS });
  }

  async reject(invitation: Invitation, code?: number): Promise<void> {
    try {
      if (code === undefined) await invitation.reject();
      else await invitation.reject({ statusCode: code });
    } catch (error) {
      this.logger?.error('Reject error:', error);
    }
  }

  hangup(session: Session, direction: AdapterDirection): void {
    try {
      if (session.state === 'Established') {
        void session.bye();
        return;
      }
      if (direction === 'outbound') {
        // Atribuído antes do invite() resolver, para o cancelamento rápido achar
        // a sessão mesmo com o INVITE ainda pendente.
        void (session as Inviter).cancel();
        return;
      }
      void this.reject(session as Invitation);
    } catch (error) {
      // `bye()`/`cancel()` podem lançar de forma síncrona. Antes esse erro era
      // engolido com log; sem o catch ele sobe pelo clique do botão "desligar".
      this.logger?.error('Hangup error:', error);
    }
  }

  attachRemoteAudio(session: Session): HTMLAudioElement | null {
    const sdh = handlerOf(session);
    if (!sdh?.peerConnection) return null;

    const audio = this.ensureRemoteAudio();
    const stream = new MediaStream();
    sdh.peerConnection.getReceivers().forEach((receiver) => {
      if (receiver.track) stream.addTrack(receiver.track);
    });
    audio.srcObject = stream;
    return audio;
  }

  setMuted(session: Session, muted: boolean): boolean | null {
    const sdh = handlerOf(session);
    if (!sdh?.peerConnection) return null;
    const tracks = sdh.peerConnection.getSenders()
      .map((sender) => sender.track)
      .filter((track): track is MediaStreamTrack => track !== null && track.kind === 'audio');
    if (tracks.length === 0) return null;
    // A track fica `enabled = !muted` — era exatamente aqui que a versão
    // herdada do hook invertia o valor (`enabled = muted`), deixando o botão
    // mudo com o microfone aberto.
    tracks.forEach((track) => { track.enabled = !muted; });
    // Estado lido de volta das tracks, não o que foi pedido.
    return tracks.every((track) => !track.enabled);
  }

  async setHold(session: Session, emEspera: boolean): Promise<boolean> {
    if (session.state !== 'Established') {
      this.logger?.warn(`Espera ignorada: sessão em "${session.state}" (só vale estabelecida).`);
      return false;
    }
    try {
      // O re-INVITE troca a direção da mídia no SDP: `hold: true` põe
      // `a=sendonly` (a central para de mandar áudio para cá) e `false` volta
      // para `a=sendrecv`. Entra pela mesma via do convite inicial
      // (`sessionDescriptionHandlerOptions`).
      const opcoesDeMidia: OpcoesDeMidia = { hold: emEspera };
      await session.invite({ sessionDescriptionHandlerOptions: opcoesDeMidia });
      return true;
    } catch (error) {
      this.logger?.error('Hold error:', error);
      return false;
    }
  }

  async refer(session: Session, destino: Session | string): Promise<boolean> {
    if (session.state !== 'Established') {
      this.logger?.warn(`Transferência ignorada: sessão em "${session.state}" (só vale estabelecida).`);
      return false;
    }
    try {
      if (typeof destino === 'string') {
        // Transferência cega: o REFER aponta para o destino no MESMO domínio da
        // linha (o mesmo host que `createInviter` usa). `makeURI` devolve
        // `undefined` quando a URI não fecha — aí não há REFER a mandar.
        const { UserAgent: SipUserAgent } = await import('sip.js');
        const uri = SipUserAgent.makeURI(`sip:${destino}@${session.localIdentity.uri.host}`);
        if (!uri) {
          this.logger?.warn(`Transferência ignorada: "${destino}" não forma URI SIP.`);
          return false;
        }
        await session.refer(uri);
        return true;
      }
      // Perna em consulta: `refer(Session)` manda REFER com `Replaces` — a
      // segunda chamada assume a vaga desta (transferência assistida).
      await session.refer(destino);
      return true;
    } catch (error) {
      this.logger?.error('Refer error:', error);
      return false;
    }
  }

  sendDTMF(session: Session, digit: string): boolean {
    if (session.state !== 'Established') {
      this.logger?.warn(`DTMF ignorado: sessão em "${session.state}" (só vale estabelecida).`);
      return false;
    }
    const sdh = handlerOf(session);
    if (!sdh?.peerConnection) return false;
    const sender = sdh.peerConnection.getSenders().find((candidate) => candidate.track?.kind === 'audio');
    if (!sender) return false;
    const dtmf = (sender as RTCRtpSender & { dtmf?: RTCDTMFSender }).dtmf;
    if (!dtmf) return false;
    try {
      dtmf.insertDTMF(digit, 100, 70);
      return true;
    } catch (error) {
      this.logger?.error('DTMF error:', error);
      return false;
    }
  }

  disposeRemoteAudio(): void {
    this.remoteAudio?.remove();
    this.remoteAudio = null;
  }

  /** Cria (ou reaproveita) o elemento de áudio remoto da página. */
  private ensureRemoteAudio(): HTMLAudioElement {
    if (this.remoteAudio) return this.remoteAudio;
    const existing = document.getElementById(REMOTE_AUDIO_ID);
    if (existing) existing.remove();
    const audio = document.createElement('audio');
    audio.id = REMOTE_AUDIO_ID;
    audio.autoplay = true;
    document.body.appendChild(audio);
    this.remoteAudio = audio;
    return audio;
  }
}
