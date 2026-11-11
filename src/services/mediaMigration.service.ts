import { supabase } from '@/integrations/supabase/client';

const CDN_TEMP_PREFIXES = ['https://mmg.whatsapp.net/', 'https://pps.whatsapp.net/'] as const;
const MIGRATION_ACTION = 'media_migration';
export const HISTORY_LIMIT = 10;

export interface MigrationHistoryEntry {
  id: string;
  createdAt: string;
  authorName: string | null;
  processed: number;
  migrated: number;
  failed: number;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function countPendingMedia(): Promise<number> {
  let total = 0;
  for (const prefix of CDN_TEMP_PREFIXES) {
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .like('media_url', `${prefix}%`);
    if (error) throw error;
    total += asCount(count);
  }
  return total;
}

export async function fetchMigrationHistory(): Promise<MigrationHistoryEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, created_at, details')
    .eq('action', MIGRATION_ACTION)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;

  const logs = data ?? [];
  const userIds = [...new Set(logs.map((log) => log.user_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('user_id, name').in('user_id', userIds)
    : { data: [] as { user_id: string; name: string | null }[] };

  return logs.map((log) => {
    const details =
      typeof log.details === 'object' && log.details !== null
        ? (log.details as Record<string, unknown>)
        : {};
    return {
      id: log.id,
      createdAt: log.created_at,
      authorName: profiles?.find((profile) => profile.user_id === log.user_id)?.name ?? null,
      processed: asCount(details.processed),
      migrated: asCount(details.migrated),
      failed: asCount(details.failed),
    };
  });
}
