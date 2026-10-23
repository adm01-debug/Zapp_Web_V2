import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface AuditLogRow {
  id: string;
  user_id: string | null;
  created_at: string;
  details: { processed: number; migrated: number; failed: number; ignored: number } | null;
}

interface RunResult {
  processed: number;
  migrated: number;
  failed: number;
}

export function MediaMigrationTool() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<{ message: string; code?: string } | null>(null);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchCount() {
      const r1 = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .like('media_url', 'https://mmg.whatsapp.net/%');
      const r2 = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .like('media_url', 'https://pps.whatsapp.net/%');
      if (r1.error || r2.error) {
        setCountError(true);
        return;
      }
      setPendingCount((r1.count ?? 0) + (r2.count ?? 0));
    }
    void fetchCount();
  }, []);

  useEffect(() => {
    async function fetchHistory() {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, created_at, details')
        .eq('action', 'media_migration')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !data) return;
      setLogs(data as AuditLogRow[]);
      const ids = [
        ...new Set(
          (data as AuditLogRow[])
            .map(l => l.user_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (ids.length > 0) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', ids);
        if (profData) {
          const map: Record<string, string> = {};
          for (const p of profData as { user_id: string; name: string }[]) {
            map[p.user_id] = p.name;
          }
          setProfileNames(map);
        }
      }
    }
    void fetchHistory();
  }, []);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });
    setRunning(false);
    if (error) {
      setRunError({ message: error.message, code: error.code });
      toast.error(error.message);
      return;
    }
    if (data) {
      const result = data as RunResult;
      setRunResult(result);
      toast.success(`${result.migrated} mídias migradas com sucesso!`);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        {countError ? (
          <p>Não foi possível contar as mídias pendentes</p>
        ) : pendingCount !== null ? (
          <p role="status">{pendingCount} mídias pendentes</p>
        ) : null}
      </div>

      <Button disabled={running} onClick={() => void handleRun()}>Iniciar Migração</Button>

      {running && (
        <div>
          <div
            role="progressbar"
            aria-label="Progresso da migração de mídia"
            aria-valuetext="Migrando mídias"
            data-state="indeterminate"
          />
          <p>Processando mídias...</p>
        </div>
      )}

      {runError && (
        <div>
          <p>{runError.message}</p>
          {runError.code && <p>Código do erro: {runError.code}</p>}
        </div>
      )}

      {runResult && (
        <div>
          <div
            role="progressbar"
            aria-label="Progresso da migração"
            aria-valuenow={runResult.migrated}
            aria-valuemin={0}
            aria-valuemax={runResult.processed}
          />
          <p>Processados</p>
          <p>
            {runResult.processed} processados, {runResult.migrated} migrados,{' '}
            {runResult.failed} falhas
          </p>
        </div>
      )}

      <div>
        {logs.length === 0 ? (
          <p>Nenhuma migração registrada.</p>
        ) : (
          <ul>
            {logs.map(log => (
              <li key={log.id}>
                <span>
                  {log.user_id
                    ? (profileNames[log.user_id] ?? log.user_id)
                    : 'Sistema'}
                </span>
                {log.details && (
                  <>
                    <span>{log.details.processed} processados</span>
                    <span>{log.details.migrated} migrados</span>
                    <span>{log.details.failed} falhas</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
