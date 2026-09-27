/**
 * Capacidades por canal — plano 2.6, 2.7 / etapa 13.
 *
 * Módulo TS puro. Os motivos são escritos em **linguagem operacional** pt-BR:
 * nada de jargão SIP/WSS/Supabase para o agente que está no telefone.
 */

import type { CallChannel } from './callStatus';

/** Motivo (id estável) de a capacidade estar limitada. */
export type CapabilityReason =
  | 'voip_unavailable'
  | 'voip_reconnecting'
  | 'voip_not_configured'
  | 'mic_blocked'
  | 'mic_missing'
  | 'mic_busy'
  | 'whatsapp_unavailable'
  | 'whatsapp_no_outbound'
  | 'whatsapp_disconnected'
  | 'line_in_use_other_user'
  | 'line_in_use_other_tab'
  | 'line_busy_here'
  | 'unknown';

/** Capacidade real de um canal (o que o código faz de verdade, sem fingir). */
export interface ChannelCapability {
  channel: CallChannel;
  canDial: boolean;
  canReceive: boolean;
  canRecord: boolean;
  canReject: boolean;
  reason?: CapabilityReason;
}

/** Rótulo operacional (pt-BR) de cada motivo. */
export const REASON_LABEL: Record<CapabilityReason, string> = {
  voip_unavailable: 'Linha VoIP indisponível',
  voip_reconnecting: 'Reconectando…',
  voip_not_configured: 'Telefone não configurado nesta conta',
  mic_blocked: 'Microfone bloqueado',
  mic_missing: 'Nenhum microfone encontrado',
  mic_busy: 'Microfone em uso por outro programa',
  whatsapp_unavailable: 'Linha de WhatsApp indisponível',
  whatsapp_no_outbound: 'Ligação por WhatsApp não disponível nesta linha',
  whatsapp_disconnected: 'WhatsApp desconectado nesta linha',
  line_in_use_other_user: 'Linha em uso por outro usuário',
  line_in_use_other_tab: 'Ligação em andamento em outra aba',
  line_busy_here: 'Você já está em uma ligação',
  unknown: 'Ligação indisponível no momento',
};

/**
 * Frase operacional do motivo, pronta para hint/tooltip.
 * Sem motivo → `null` (a UI não mostra nada).
 */
export function describeReason(reason: CapabilityReason | null | undefined): string | null {
  if (reason === null || reason === undefined) return null;
  const label = REASON_LABEL[reason];
  return typeof label === 'string' && label.length > 0 ? label : null;
}
