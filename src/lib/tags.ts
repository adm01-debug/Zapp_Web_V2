export function isWhatsAppTag(tag: string): boolean { return tag.toLowerCase().startsWith('wa:'); }

export function parseWhatsAppTag(tag: string): { labelId: string; displayName: string } | null {
  if (!isWhatsAppTag(tag)) return null;
  const parts = tag.split(':');
  if (parts.length < 3) return null;
  if (!parts[1]) return null;
  return { labelId: parts[1], displayName: parts.slice(2).join(':') };
}

export function getTagDisplayName(tag: string): string {
  const parsed = parseWhatsAppTag(tag);
  return parsed ? parsed.displayName : tag;
}

export function normalizeTag(tag: string): string { return tag.trim(); }

export function filterWATags(tags: string[]): string[] { return tags.filter(isWhatsAppTag); }

export function filterCustomTags(tags: string[]): string[] { return tags.filter(t => !isWhatsAppTag(t)); }

export type TagArray = string[];
