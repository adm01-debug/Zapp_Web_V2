export type TeamMessageStatusType = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';

const ALLOWED: ReadonlySet<string> = new Set<TeamMessageStatusType>([
  'sending', 'sent', 'delivered', 'read', 'failed', 'deleted',
]);

export function normalizeTeamMessageStatus(raw: string | null | undefined): TeamMessageStatusType {
  if (raw && ALLOWED.has(raw)) return raw as TeamMessageStatusType;
  return 'sent';
}
