/**
 * Maquina de estado do TOQUE da chamada recebida (etapa T27).
 *
 * O toque e um ALERTA, nao midia de conversa: quem o emite e o `IncomingCallAlert`
 * (WebAudio proprio, oscilador -> gain -> `ctx.destination`, separado do volume das
 * midias). Este modulo e PURO e decide apenas QUANDO ele deve soar, a partir dos
 * eventos reais da sessao (`CallSessionEvent`, `src/lib/calls/session.ts`).
 *
 * O timeout de 30s NAO mora aqui: quem conta e a maquina da sessao (provider).
 * Aqui so reagimos aos eventos.
 */

import type { CallSessionEventType } from './session';

/** Eventos que mudam o estado do toque (subconjunto do union real da sessao). */
export type EventoDeToque = Extract<
  CallSessionEventType,
  'INVITE_RECEIVED' | 'ACCEPT' | 'REJECT' | 'TIMEOUT' | 'HANGUP_REMOTE'
>;

export type EstadoDeToque = 'tocando' | 'parado';

/** Os quatro eventos que param o toque (aceite do plano, etapa T27). */
export const EVENTOS_QUE_PARAM: readonly EventoDeToque[] = [
  'ACCEPT',
  'REJECT',
  'TIMEOUT',
  'HANGUP_REMOTE',
];

/**
 * Proximo estado do toque. `INVITE_RECEIVED` liga; os quatro que param desligam.
 * Switch explicito de proposito: cada evento e uma decisao visivel.
 */
export function proximoToque(estado: EstadoDeToque, evento: EventoDeToque): EstadoDeToque {
  switch (evento) {
    case 'INVITE_RECEIVED':
      return 'tocando';
    case 'ACCEPT':
    case 'REJECT':
    case 'TIMEOUT':
    case 'HANGUP_REMOTE':
      return 'parado';
  }
}

/** O toque deve soar agora? */
export function deveTocar(estado: EstadoDeToque): boolean {
  return estado === 'tocando';
}
