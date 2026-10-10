export type PersistedCallStatus = 'ringing' | 'answered' | 'ended' | 'missed' | 'busy' | 'failed';

const CALL_STATUS_MAP = new Map<string, PersistedCallStatus>([
  ['offer', 'ringing'],
  ['ringing', 'ringing'],
  ['answered', 'answered'],
  ['accept', 'answered'],
  ['ended', 'ended'],
  ['terminate', 'ended'],
  ['reject', 'missed'],
  ['timeout', 'missed'],
  ['missed', 'missed'],
  ['busy', 'busy'],
  ['failed', 'failed'],
]);

export function normalizeEvolutionCallStatus(value: unknown): PersistedCallStatus {
  if (typeof value !== 'string') return 'ringing';
  return CALL_STATUS_MAP.get(value.trim().toLowerCase()) ?? 'ringing';
}

export function shouldNotifyIncomingCall(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const status = value.trim().toLowerCase();
  return status === 'offer' || status === 'ringing';
}

/**
 * Direcao da chamada a partir do payload do Evolution (T25).
 *
 * O plano pede a direcao por `fromMe`/`isOutgoing`; as duas chaves aparecem em
 * versoes diferentes do provedor, entao leio as duas de forma defensiva — mesmo
 * padrao de `evolution-webhook/index.ts:208-211`. Sem nenhuma das duas a
 * chamada e tratada como recebida, que e o comportamento do canal WhatsApp do
 * produto (T23 marca `canDial: false`).
 */
export function direcaoDaChamada(data: Record<string, unknown>): 'inbound' | 'outbound' {
  const saiu = data.fromMe === true || data.isOutgoing === true;
  return saiu ? 'outbound' : 'inbound';
}

/**
 * Instante do evento segundo o provedor (`data.date`, T25). Devolve `null`
 * quando ausente ou invalido, para o chamador decidir o fallback (a RPC grava
 * `now()` hoje). Consumo previsto na etapa T26, junto de `p_direction`.
 */
export function instanteDaChamada(data: Record<string, unknown>): string | null {
  const bruto = data.date;
  if (typeof bruto !== 'string') return null;
  const ms = Date.parse(bruto);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Notifica apenas chamada RECEBIDA: saida (`fromMe`/`isOutgoing`) nao alerta. */
export function deveNotificarChamada(
  status: unknown,
  direcao: 'inbound' | 'outbound',
): boolean {
  return direcao === 'inbound' && shouldNotifyIncomingCall(status);
}

export function normalizeEvolutionCallVideo(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

interface IncomingCallNotificationInput {
  userId: string;
  contactId: string;
  contactName: string;
  phone: string;
  isVideo: boolean;
  callStatus: PersistedCallStatus;
  whatsappConnectionId: string;
  callId?: string;
  eventId?: string;
}

export function buildIncomingCallNotification(input: IncomingCallNotificationInput) {
  return {
    user_id: input.userId,
    type: 'incoming_call',
    title: input.isVideo ? '📹 Chamada de vídeo recebida' : '📞 Chamada de voz recebida',
    message: `${input.contactName || input.phone} está ligando para você`,
    metadata: {
      contact_id: input.contactId,
      contact_name: input.contactName || input.phone,
      phone: input.phone,
      is_video: input.isVideo,
      call_status: input.callStatus,
      whatsapp_connection_id: input.whatsappConnectionId,
      ...(input.callId ? { call_id: input.callId } : {}),
      ...(input.eventId ? { event_id: input.eventId } : {}),
    },
  };
}

interface SentimentNotificationInput {
  notificationId?: string;
  userId: string;
  contactName: string;
  metadata: Record<string, unknown>;
}

export function buildSentimentNotification(input: SentimentNotificationInput) {
  return {
    ...(input.notificationId ? { id: input.notificationId } : {}),
    user_id: input.userId,
    type: 'sentiment_alert',
    title: `⚠️ Alerta de sentimento: ${input.contactName}`,
    message: typeof input.metadata.message === 'string'
      ? input.metadata.message
      : `Sentimento negativo detectado para ${input.contactName}`,
    metadata: input.metadata,
  };
}

/** Preferences belong to the recipient; the caller is only the fallback for unassigned alerts. */
export function sentimentSettingsOwnerId(callerUserId: string, recipientUserId?: string | null): string {
  return recipientUserId || callerUserId;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

export function singleLineLabel(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
