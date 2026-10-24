import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type PendingState =
  | { type: 'loading' }
  | { type: 'ok'; count: number }
  | { type: 'error' };

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
}

interface MigrationError {
  message: string;
  code: string;
}

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

export function MediaMigrationTool() {
  const [pending, setPending] = useState<PendingState>({ type: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [migError, setMigError] = useState<MigrationError | null>(null);
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

  async function executeMigration() {
    setRunning(true);
    setMigError(null);
    setResult(null);
    const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });
    setRunning(false);
    if (error) {
      const err = error as MigrationError;
      setMigError(err);
      toast.error(err.message);
    } else if (data) {
      const migData = data as MigrationResult;
      setResult(migData);
      toast.success(`${migData.migrated} mídias migradas com sucesso!`);
    }
  }

  function getAuthorName(userId: string | null): string {
    if (!userId) return 'Sistema';
    return profiles.find((p) => p.user_id === userId)?.name ?? 'Sistema';
  }

  return (
    <div className="space-y-6 p-4">
      <div role="status">
        {pending.type === 'ok' && `${pending.count} mídias pendentes`}
        {pending.type === 'error' && 'Não foi possível contar as mídias pendentes'}
      </div>

      <Button onClick={() => setDialogOpen(true)} disabled={running}>
        Iniciar Migração
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending.type === 'ok'
                ? `${pending.count} mídias aguardam migração`
                : 'Mídias aguardam migração'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeMigration}>
              Iniciar migração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {running && (
        <div>
          <div
            role="progressbar"
            aria-label="Progresso da migração de mídia"
            aria-valuetext="Migrando mídias"
          />
          <p>o total só aparece quando a execução termina</p>
        </div>
      )}

      {result && !running && (
        <div>
          <p>Processados</p>
          <p>{result.processed}</p>
          <p>{result.migrated} migrados</p>
          <p>{result.failed} falhas</p>
        </div>
      )}

      {migError && (
        <div>
          <p>{migError.message}</p>
          <p>Código do erro: {migError.code}</p>
        </div>
      )}

      <div>
        {logs.length === 0 ? (
          <p>Nenhuma migração registrada.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id}>
              <span>{getAuthorName(log.user_id)}</span>
              <span>{log.details.processed} processados</span>
              <span>{log.details.migrated} migrados</span>
              <span>{log.details.failed} falhas</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
