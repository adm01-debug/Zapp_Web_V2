import type { EmailMessage } from '@/hooks/integrations/useGmail';

export interface EmailConversationPerson {
  email: string;
  name: string | null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() || '';
  return email.includes('@') ? email : null;
}

/**
 * Selects the actual external interlocutor without trusting `last_from_address`.
 * The first external participant is stable for the lifetime of the thread.
 * A later reply-all sender must not silently replace the person/company shown
 * in the sidebar; for outbound-only threads Gmail's To order is authoritative
 * and CC remains only a fallback.
 */
export function resolveEmailConversationPerson(
  messages: EmailMessage[],
  accountEmail?: string | null,
): EmailConversationPerson | null {
  const ownEmail = normalizeEmail(accountEmail);
  const ordered = [...messages].sort((left, right) =>
    left.internal_date.localeCompare(right.internal_date) || left.id.localeCompare(right.id));
  for (const message of ordered) {
    const sender = normalizeEmail(message.from_address);
    if (message.direction === 'inbound' && sender && sender !== ownEmail) {
      return { email: sender, name: message.from_name?.trim() || null };
    }
  }
  for (const message of ordered) {
    if (message.direction === 'outbound') {
      const recipient = [...message.to_addresses, ...message.cc_addresses]
        .map(normalizeEmail)
        .find((email): email is string => Boolean(email && email !== ownEmail));
      if (recipient) return { email: recipient, name: null };
    }
  }
  return null;
}
