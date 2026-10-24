import type { EmailMessage } from '@/hooks/gmail/gmailTypes';

const SIMPLE_EMAIL_RE = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

export interface ReplyRecipients {
  to: string[];
  cc: string[];
}

function splitOutsideQuotes(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  let angleDepth = 0;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === '<') angleDepth += 1;
    if (!quoted && char === '>' && angleDepth > 0) angleDepth -= 1;
    if (!quoted && angleDepth === 0 && (char === ',' || char === ';')) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function extractEmailAddress(value: string): string | null {
  if (/\r|\n/.test(value)) return null;
  const trimmed = value.trim();
  const angle = trimmed.match(/<\s*([^<>]+)\s*>$/);
  const candidate = (angle?.[1] ?? trimmed).trim();
  return SIMPLE_EMAIL_RE.test(candidate) ? candidate : null;
}

export function parseEmailAddressList(value: string | string[] | null | undefined): string[] {
  const sources = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const source of sources) {
    for (const token of splitOutsideQuotes(source)) {
      const address = extractEmailAddress(token);
      if (!address) continue;
      const key = address.toLocaleLowerCase('en-US');
      if (!seen.has(key)) {
        seen.add(key);
        addresses.push(address);
      }
    }
  }
  return addresses;
}

export function invalidEmailTokens(value: string): string[] {
  return splitOutsideQuotes(value).filter(token => !extractEmailAddress(token));
}

function addUnique(target: string[], seen: Set<string>, values: Array<string | null | undefined>, self: Set<string>) {
  for (const value of values) {
    if (!value) continue;
    for (const address of parseEmailAddressList(value)) {
      const key = address.toLocaleLowerCase('en-US');
      if (!self.has(key) && !seen.has(key)) {
        seen.add(key);
        target.push(address);
      }
    }
  }
}

export function resolveReplyRecipients(
  message: EmailMessage,
  mode: 'reply' | 'reply-all',
  accountEmail?: string,
  aliases: string[] = [],
): ReplyRecipients {
  const self = new Set(parseEmailAddressList([accountEmail ?? '', ...aliases]).map(value => value.toLocaleLowerCase('en-US')));
  const to: string[] = [];
  const cc: string[] = [];
  const seen = new Set<string>();
  const primary = message.direction === 'inbound'
    ? message.reply_to_address || message.from_address
    : message.to_addresses.find(address => !self.has(address.toLocaleLowerCase('en-US'))) || message.to_addresses[0];

  addUnique(to, seen, [primary], self);
  if (mode === 'reply-all') {
    addUnique(to, seen, message.to_addresses, self);
    addUnique(cc, seen, message.cc_addresses, self);
  }
  return { to, cc };
}

export function prefixEmailSubject(subject: string, prefix: 'Re' | 'Fwd'): string {
  const clean = subject.trim();
  const existing = prefix === 'Re' ? /^\s*re\s*:/i : /^\s*(fwd?|enc)\s*:/i;
  return existing.test(clean) ? clean : `${prefix}: ${clean}`.trim();
}
