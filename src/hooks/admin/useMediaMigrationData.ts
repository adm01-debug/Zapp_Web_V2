import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PendingState =
  | { type: 'loading' }
  | { type: 'ok'; count: number }
  | { type: 'error' };

interface AuditLog {
  id: string;
  user_id: string | null;
  created_at: string;
  details: {
    processed: number;
    migrated: number;
    failed: number;
    ignored: number;
  };
}

interface Profile {
  user_id: string;
  name: string;
}

export function useMediaMigrationData() {
  const [pending, setPending] = useState<PendingState>({ type: 'loading' });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    async function countPending() {
      const [mmg, pps] = await Promise.all([
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://mmg.whatsapp.net/%'),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://pps.whatsapp.net/%'),
      ]);
      if (mmg.error || pps.error) {
        setPending({ type: 'error' });
      } else {
        setPending({ type: 'ok', count: (mmg.count ?? 0) + (pps.count ?? 0) });
      }
    }
    void countPending();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, created_at, details')
        .eq('action', 'media_migration')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !data) return;
      const auditLogs = data as AuditLog[];
      setLogs(auditLogs);

      const userIds = [
        ...new Set(
          auditLogs.map((l) => l.user_id).filter((id): id is string => id !== null),
        ),
      ];
      if (userIds.length === 0) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);
      if (profileData) setProfiles(profileData as Profile[]);
    }
    void loadHistory();
  }, []);

  return { pending, logs, profiles };
}
