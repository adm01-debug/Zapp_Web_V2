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
 * Incoming senders take precedence; for outbound messages Gmail's To order is the
 * explicit primary-recipient order. CC is only a fallback.
 */
export function resolveEmailConversationPerson(
  messages: EmailMessage[],
  accountEmail?: string | null,
): EmailConversationPerson | null {
  const ownEmail = normalizeEmail(accountEmail);
  const ordered = [...messages].sort((left, right) => right.internal_date.localeCompare(left.internal_date));
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
