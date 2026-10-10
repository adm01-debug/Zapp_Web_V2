import { describe, it, expect } from 'vitest';

// ─── Test the phone normalization logic from evolution-webhook ───

function normalizePhone(rawJid?: string): string | null {
  if (!rawJid) return null;
  return rawJid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/^\+/, '');
}

function normalizeEventName(event?: string): string {
  return (event || '').trim().toLowerCase().replace(/_/g, '.');
}

describe('Phone Normalization', () => {
  describe('Standard JIDs', () => {
    it('strips @s.whatsapp.net suffix', () => {
      expect(normalizePhone('5511999999999@s.whatsapp.net')).toBe('5511999999999');
    });

    it('strips @g.us suffix for groups', () => {
      expect(normalizePhone('120363999999999999@g.us')).toBe('120363999999999999');
    });

    it('strips leading + sign', () => {
      expect(normalizePhone('+5511999999999')).toBe('5511999999999');
    });

    it('handles JID with + and suffix', () => {
      expect(normalizePhone('+5511999999999@s.whatsapp.net')).toBe('5511999999999');
    });
  });

  describe('Edge Cases', () => {
    it('returns null for undefined input', () => {
      expect(normalizePhone(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizePhone('')).toBeNull();
    });

    it('returns plain number unchanged', () => {
      expect(normalizePhone('5511999999999')).toBe('5511999999999');
    });

    it('handles number with country code only', () => {
      expect(normalizePhone('55')).toBe('55');
    });

    it('handles very long numbers', () => {
      const longNumber = '1' + '0'.repeat(30);
      expect(normalizePhone(longNumber)).toBe(longNumber);
    });
  });
});

describe('Event Name Normalization', () => {
  describe('Standard Events', () => {
    it('normalizes underscores to dots', () => {
      expect(normalizeEventName('messages_upsert')).toBe('messages.upsert');
    });

    it('lowercases event names', () => {
      expect(normalizeEventName('MESSAGES_UPDATE')).toBe('messages.update');
    });

    it('trims whitespace', () => {
      expect(normalizeEventName('  messages_upsert  ')).toBe('messages.upsert');
    });

    it('handles already normalized names', () => {
      expect(normalizeEventName('messages.upsert')).toBe('messages.upsert');
    });
  });

  describe('Edge Cases', () => {
    it('returns empty string for undefined', () => {
      expect(normalizeEventName(undefined)).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeEventName('')).toBe('');
    });

    it('handles multiple underscores', () => {
      expect(normalizeEventName('some_nested_event_name')).toBe('some.nested.event.name');
    });
  });

  describe('All Known Events', () => {
    const knownEvents = [
      'messages.upsert', 'messages.update', 'messages.delete',
      'contacts.upsert', 'contacts.update',
      'chats.upsert', 'chats.update', 'chats.delete',
      'connection.update', 'qrcode.updated',
    ];

    for (const event of knownEvents) {
      it(`handles ${event}`, () => {
        expect(normalizeEventName(event)).toBe(event);
      });
    }
  });
});
