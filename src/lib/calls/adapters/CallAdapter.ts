/**
 * Contrato entre o motor de chamadas (React) e o transporte SIP — etapa T09 de
 * `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`.
 *
 * Motivo: `useSipClient.ts` misturava estado React com sip.js (UA, Inviter,
 * Invitation, mídia e DTMF). Aqui fica só a fronteira; quem implementa é
 * `SipCallAdapter`. Assim a Fase 1 pode trocar de transporte sem tocar o
 * provider, e o teste do hook não precisa conhecer `sip.js` além do mock.
 *
 * Este módulo é **type-only**: nenhum import de valor, para não arrastar a lib
 * para o bundle inicial (o carregamento de `sip.js` continua dinâmico, dentro
 * do adapter).
 */

import type { Invitation, Inviter, Session, UserAgent } from 'sip.js';

/** Direção da chamada — mesma união de `calls.direction`. */
export type AdapterDirection = 'inbound' | 'outbound';

/** Log mínimo aceito pelo adapter, para ele não depender de `@/lib/logger`. */
export interface AdapterLogger {
  error(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
}

export interface CallAdapter {
  /** Host do UA — base da URI de destino. */
  hostOf(ua: UserAgent): string;

  /**
   * O número forma uma URI SIP válida para este UA? Checado **antes** de a
   * chamada entrar em curso, para o inválido não deixar a sessão presa em
   * `calling` (a resolução da URI é síncrona, mas o import da lib é dinâmico).
   */
  isDialable(ua: UserAgent, number: string): Promise<boolean>;

  /** Cria o `Inviter` do destino. Não dispara o INVITE. */
  createInviter(ua: UserAgent, number: string): Promise<Inviter>;

  /** Dispara o INVITE. */
  invite(inviter: Inviter): Promise<void>;

  /** Número remoto de uma sessão/convite de entrada. */
  remoteNumberOf(session: Session): string;

  /** Atende um convite recebido. */
  accept(invitation: Invitation): Promise<void>;

  /**
   * Recusa um convite recebido (`code` 486 = ocupado). Nunca lança: registra e
   * segue — recusa que falha não pode derrubar a tela da chamada.
   */
  reject(invitation: Invitation, code?: number): Promise<void>;

  /**
   * Encerra a sessão: `bye` se estabelecida, `cancel` se for saída ainda não
   * atendida, `reject` se for entrada ainda não atendida.
   */
  hangup(session: Session, direction: AdapterDirection): void;

  /** Liga o áudio remoto ao elemento de áudio da página. `null` sem mídia. */
  attachRemoteAudio(session: Session): HTMLAudioElement | null;

  /**
   * Aplica o mute nas tracks de áudio de saída e devolve o **estado lido de
   * volta** das tracks (`true` = mudo), que é o que a UI deve mostrar. `null`
   * quando não há mídia — aí o chamador decide pelo estado pretendido.
   */
  setMuted(session: Session, muted: boolean): boolean | null;

  /**
   * Envia um dígito DTMF. Só vale com a sessão estabelecida: fora disso é
   * no-op com `warn` (teclado apertado durante o toque não pode virar dígito
   * fantasma depois). Devolve `false` quando não há sender de áudio.
   */
  sendDTMF(session: Session, digit: string): boolean;

  /** Descarta o elemento de áudio remoto (unmount). */
  disposeRemoteAudio(): void;
}
