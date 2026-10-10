import { safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/safeStorage';

const DRAFT_STORAGE_PREFIX = 'zapp-email-draft-v2';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface EmailDraftSession {
  draftId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  isUsingHtml: boolean;
  attachmentNames: string[];
  updatedAt: string;
}

interface DraftIdentity {
  userId?: string;
  accountId?: string;
  mode: 'new' | 'reply' | 'reply-all' | 'forward';
  threadId?: string;
  messageId?: string;
}

export function emailDraftSessionKey(identity: DraftIdentity): string | null {
  if (!identity.accountId) return null;
  const target = identity.threadId || identity.messageId || 'standalone';
  return [DRAFT_STORAGE_PREFIX, identity.userId || identity.accountId, identity.accountId, identity.mode, target, identity.messageId || 'latest'].join(':');
}

export function readEmailDraftSession(key: string | null): EmailDraftSession | null {
  if (!key) return null;
  const raw = safeGetItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<EmailDraftSession>;
    if (
      typeof value.to !== 'string' ||
      typeof value.cc !== 'string' ||
      typeof value.bcc !== 'string' ||
      typeof value.subject !== 'string' ||
      typeof value.body !== 'string'
    ) return null;
    const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';
    const updatedAtMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > DRAFT_MAX_AGE_MS) {
      safeRemoveItem(key);
      return null;
    }
    return {
      draftId: typeof value.draftId === 'string' ? value.draftId : undefined,
      to: value.to,
      cc: value.cc,
      bcc: value.bcc,
      subject: value.subject,
      body: value.body,
      isUsingHtml: value.isUsingHtml === true,
      attachmentNames: Array.isArray(value.attachmentNames)
        ? value.attachmentNames.filter((name): name is string => typeof name === 'string')
        : [],
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeEmailDraftSession(key: string | null, draft: EmailDraftSession): void {
  if (!key) return;
  safeSetItem(key, JSON.stringify(draft));
}

export function removeEmailDraftSession(key: string | null): void {
  if (!key) return;
  safeRemoveItem(key);
}

/** Remove every local Email composition so a later login cannot inherit it. */
export function clearEmailDraftSessions(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${DRAFT_STORAGE_PREFIX}:`)) keys.push(key);
    }
    keys.forEach(safeRemoveItem);
    return keys.length;
  } catch {
    return 0;
  }
}
