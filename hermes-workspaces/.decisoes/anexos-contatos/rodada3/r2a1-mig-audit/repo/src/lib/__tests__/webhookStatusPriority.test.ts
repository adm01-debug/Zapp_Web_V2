import { describe, it, expect } from 'vitest';

// ─── Test the status priority logic from evolution-webhook ───

const STATUS_PRIORITY: Record<string, number> = {
  'sending': 0,
  'sent': 1,
  'delivered': 2,
  'read': 3,
  'played': 3,
  'failed': -1,
  'deleted': 99,
  'received': 1,
};

function shouldUpdateStatus(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return true;
  if (newStatus === 'deleted' || newStatus === 'failed') return true;
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
  const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
  return newPriority > currentPriority;
}

describe('Webhook Status Priority', () => {
  describe('Null Current Status', () => {
    it('always updates when current is null', () => {
      expect(shouldUpdateStatus(null, 'sent')).toBe(true);
      expect(shouldUpdateStatus(null, 'delivered')).toBe(true);
      expect(shouldUpdateStatus(null, 'read')).toBe(true);
      expect(shouldUpdateStatus(null, 'failed')).toBe(true);
      expect(shouldUpdateStatus(null, 'sending')).toBe(true);
    });
  });

  describe('Forward Progression', () => {
    it('sending → sent', () => {
      expect(shouldUpdateStatus('sending', 'sent')).toBe(true);
    });

    it('sent → delivered', () => {
      expect(shouldUpdateStatus('sent', 'delivered')).toBe(true);
    });

    it('delivered → read', () => {
      expect(shouldUpdateStatus('delivered', 'read')).toBe(true);
    });

    it('sending → delivered', () => {
      expect(shouldUpdateStatus('sending', 'delivered')).toBe(true);
    });

    it('sending → read (skip delivered)', () => {
      expect(shouldUpdateStatus('sending', 'read')).toBe(true);
    });

    it('sent → read (skip delivered)', () => {
      expect(shouldUpdateStatus('sent', 'read')).toBe(true);
    });
  });

  describe('Backward Prevention', () => {
    it('read → sent (should not update)', () => {
      expect(shouldUpdateStatus('read', 'sent')).toBe(false);
    });

    it('read → delivered (should not update)', () => {
      expect(shouldUpdateStatus('read', 'delivered')).toBe(false);
    });

    it('delivered → sent (should not update)', () => {
      expect(shouldUpdateStatus('delivered', 'sent')).toBe(false);
    });

    it('read → sending (should not update)', () => {
      expect(shouldUpdateStatus('read', 'sending')).toBe(false);
    });
  });

  describe('Same Status', () => {
    it('sending → sending (should not update)', () => {
      expect(shouldUpdateStatus('sending', 'sending')).toBe(false);
    });

    it('sent → sent (should not update)', () => {
      expect(shouldUpdateStatus('sent', 'sent')).toBe(false);
    });

    it('read → read (should not update)', () => {
      expect(shouldUpdateStatus('read', 'read')).toBe(false);
    });
  });

  describe('Special Statuses', () => {
    it('deleted always overrides', () => {
      expect(shouldUpdateStatus('sending', 'deleted')).toBe(true);
      expect(shouldUpdateStatus('sent', 'deleted')).toBe(true);
      expect(shouldUpdateStatus('delivered', 'deleted')).toBe(true);
      expect(shouldUpdateStatus('read', 'deleted')).toBe(true);
    });

    it('failed always overrides', () => {
      expect(shouldUpdateStatus('sending', 'failed')).toBe(true);
      expect(shouldUpdateStatus('sent', 'failed')).toBe(true);
      expect(shouldUpdateStatus('delivered', 'failed')).toBe(true);
      expect(shouldUpdateStatus('read', 'failed')).toBe(true);
    });

    it('played has same priority as read', () => {
      expect(shouldUpdateStatus('delivered', 'played')).toBe(true);
      expect(shouldUpdateStatus('read', 'played')).toBe(false);
      expect(shouldUpdateStatus('played', 'read')).toBe(false);
    });

    it('received has same priority as sent', () => {
      expect(shouldUpdateStatus('sending', 'received')).toBe(true);
      expect(shouldUpdateStatus('delivered', 'received')).toBe(false);
    });
  });

  describe('Unknown Status', () => {
    it('unknown status defaults to priority 0', () => {
      expect(shouldUpdateStatus('unknown_status', 'sent')).toBe(true);
      expect(shouldUpdateStatus('unknown_status', 'sending')).toBe(false);
    });

    it('transition to unknown status from sent (should not update)', () => {
      expect(shouldUpdateStatus('sent', 'some_new_status')).toBe(false);
    });
  });
});
