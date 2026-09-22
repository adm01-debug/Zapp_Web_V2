import { describe, expect, it } from 'vitest';
import {
  buildIncomingCallNotification,
  buildSentimentNotification,
  escapeHtml,
  normalizeEvolutionCallVideo,
  normalizeEvolutionCallStatus,
  shouldNotifyIncomingCall,
  singleLineLabel,
} from '../../supabase/functions/_shared/notification-events';

describe('notification event contracts', () => {
  it.each([
    ['offer', 'ringing'],
    ['ringing', 'ringing'],
    ['accept', 'answered'],
    ['answered', 'answered'],
    ['terminate', 'ended'],
    ['reject', 'missed'],
    ['timeout', 'missed'],
    ['busy', 'busy'],
    ['failed', 'failed'],
  ] as const)('normalizes Evolution call status %s to %s', (source, expected) => {
    expect(normalizeEvolutionCallStatus(source)).toBe(expected);
  });

  it('only rings for offer/ringing and fails closed for absent or terminal states', () => {
    expect(shouldNotifyIncomingCall('offer')).toBe(true);
    expect(shouldNotifyIncomingCall('RINGING')).toBe(true);
    expect(shouldNotifyIncomingCall('  offer  ')).toBe(true);
    for (const status of [undefined, null, '', 'answered', 'missed', 'busy', 'failed', 'unknown']) {
      expect(shouldNotifyIncomingCall(status)).toBe(false);
    }
  });

  it('normalizes Evolution video flags without treating the string false as truthy', () => {
    expect(normalizeEvolutionCallVideo(true)).toBe(true);
    expect(normalizeEvolutionCallVideo(' TRUE ')).toBe(true);
    for (const value of [false, 'false', '0', 1, undefined, null]) {
      expect(normalizeEvolutionCallVideo(value)).toBe(false);
    }
  });

  it('builds a user-scoped call notification without customer data in the title', () => {
    const notification = buildIncomingCallNotification({
      userId: 'user-1',
      contactId: 'contact-1',
      contactName: 'Maria',
      phone: '5511999999999',
      isVideo: true,
      callStatus: 'ringing',
      whatsappConnectionId: 'connection-1',
      callId: 'call-1',
      eventId: 'event-1',
    });

    expect(notification).toMatchObject({
      user_id: 'user-1',
      type: 'incoming_call',
      metadata: {
        contact_id: 'contact-1',
        contact_name: 'Maria',
        call_status: 'ringing',
        call_id: 'call-1',
        event_id: 'event-1',
      },
    });
    expect(notification.title).not.toContain('Maria');
  });

  it('builds a targeted sentiment notification with the stable analysis identity', () => {
    const notification = buildSentimentNotification({
      notificationId: 'analysis-1',
      userId: 'user-2',
      contactName: 'Cliente',
      metadata: { analysis_id: 'analysis-1', sentiment_score: 15, message: 'Alerta' },
    });
    expect(notification).toEqual({
      id: 'analysis-1',
      user_id: 'user-2',
      type: 'sentiment_alert',
      title: '⚠️ Alerta de sentimento: Cliente',
      message: 'Alerta',
      metadata: { analysis_id: 'analysis-1', sentiment_score: 15, message: 'Alerta' },
    });
  });

  it('escapes HTML and removes header-breaking newlines from customer labels', () => {
    expect(escapeHtml(`<b>João & "Maria"</b>`)).toBe('&lt;b&gt;João &amp; &quot;Maria&quot;&lt;/b&gt;');
    expect(singleLineLabel('João\r\nBcc: victim@example.com')).toBe('João Bcc: victim@example.com');
  });
});
