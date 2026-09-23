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
