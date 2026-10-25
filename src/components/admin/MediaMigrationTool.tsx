import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle }
  from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface LogEntry {
  id: string; user_id: string | null; created_at: string;
  details: { processed: number; migrated: number; failed: number; ignored?: number };
}
interface MigrationResult { processed: number; migrated: number; failed: number; }
interface MigrationError { message: string; code: string; status?: number; }

export function MediaMigrationTool() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [running, setRunning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState<MigrationError | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function loadCount() {
      try {
        const r1 = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://mmg.whatsapp.net/%');
        const r2 = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://pps.whatsapp.net/%');
        if (r1.error || r2.error) { setCountError(true); return; }
        setPendingCount((r1.count ?? 0) + (r2.count ?? 0));
      } catch { setCountError(true); }
    }
    void loadCount();
  }, []);

  useEffect(() => {
    async function loadLogs() {
      try {
        const { data, error } = await supabase.from('audit_logs').select('*')
          .eq('action', 'media_migration')
          .order('created_at', { ascending: false }).limit(10);
        if (error || !data) return;
        setLogs(data as LogEntry[]);
        const userIds = (data as LogEntry[]).filter(l => l.user_id).map(l => l.user_id as string);
        if (userIds.length > 0) {
          const { data: profileData } = await supabase.from('profiles')
            .select('user_id, name').in('user_id', userIds);
          if (profileData) {
            setProfileNames(new Map((profileData as Array<{user_id: string; name: string}>)
              .map(p => [p.user_id, p.name])));
          }
        }
      } catch { /* ignore */ }
    }
    void loadLogs();
  }, []);

  function handleClickStart() {
    setMigrationError(null); setResult(null);
    if (pendingCount !== null) { setShowDialog(true); }
    else { void runMigration(); }
  }

  async function runMigration() {
    setRunning(true); setMigrationError(null); setResult(null);
    const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });
    setRunning(false);
    if (error) {
      const err = error as MigrationError;
      setMigrationError(err); toast.error(err.message);
    } else if (data) {
      const res = data as MigrationResult;
      setResult(res); toast.success(`${res.migrated} mídias migradas com sucesso!`);
    }
  }

  function handleConfirm() { setShowDialog(false); void runMigration(); }

  return (
    <div>
      {countError ? (
        <p>Não foi possível contar as mídias pendentes</p>
      ) : pendingCount !== null ? (
        <p role="status">{pendingCount} mídias pendentes</p>
      ) : null}
      {!running && <Button onClick={handleClickStart}>Iniciar Migração</Button>}
      {running && (
        <div>
          <Progress aria-label="Progresso da migração de mídia" aria-valuetext="Migrando mídias" />
          <p>Processando mídias...</p>
          <p>o total só aparece quando a execução termina</p>
        </div>
      )}
      {migrationError && (
        <div>
          <p>{migrationError.message}</p>
          <p>Código do erro: {migrationError.code}</p>
        </div>
      )}
      {result && <div><p>Processados</p></div>}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCount} mídias aguardam migração
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Iniciar migração</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {logs.length === 0 ? (
        <p>Nenhuma migração registrada.</p>
      ) : (
        <div>
          {logs.map(log => (
            <div key={log.id}>
              <span>{log.user_id ? (profileNames.get(log.user_id) ?? log.user_id) : 'Sistema'}</span>
              <span>{log.details.processed} processados</span>
              <span>{log.details.migrated} migrados</span>
              <span>{log.details.failed} falhas</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
