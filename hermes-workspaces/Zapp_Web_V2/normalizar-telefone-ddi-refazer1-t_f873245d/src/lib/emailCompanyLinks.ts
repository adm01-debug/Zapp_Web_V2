import type { EmailCompanySocial } from '@/types/emailContactContext';

const MAX_URL_LENGTH = 2048;

export function normalizeExternalUrl(value: unknown, allowedHosts?: readonly string[]): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL_LENGTH) return null;
  const raw = value.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    if (allowedHosts && !allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function companySocialLinks(value: unknown): EmailCompanySocial[] {
  if (!Array.isArray(value)) return [];
  const links = new Map<EmailCompanySocial['platform'], EmailCompanySocial>();
  for (const social of value) {
    if (!social || typeof social !== 'object' || Array.isArray(social)) continue;
    const record = social as Record<string, unknown>;
    const platform = typeof record.platform === 'string' ? record.platform.toLowerCase().trim() : '';
    if (platform !== 'linkedin' && platform !== 'instagram') continue;
    const url = normalizeExternalUrl(record.url, platform === 'linkedin' ? ['linkedin.com'] : ['instagram.com']);
    if (url && !links.has(platform)) links.set(platform, { platform, url });
  }
  return [...links.values()];
}
