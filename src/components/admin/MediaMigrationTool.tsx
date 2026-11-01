import { useState, useEffect } from 'react';
import { HardDrive, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';

const CDN_PREFIXES = [
  'https://mmg.whatsapp.net/',
  'https://pps.whatsapp.net/',
];

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
  ignored?: number;
  message?: string;
}

interface EdgeError {
  message?: string;
  code?: string;
  status?: number;
}

interface LogEntry {
  id: string;
  user_id: string | null;
  created_at: string;
  details: { processed: number; migrated: number; failed: number; ignored?: number };
  user?: { name: string } | null;
}

export function MediaMigrationTool() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [edgeError, setEdgeError] = useState<EdgeError | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [history, setHistory] = useState<LogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let total = 0;
      for (const prefix of CDN_PREFIXES) {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', `${prefix}%`);
        if (error) {
          if (!cancelled) setCountError(true);
          return;
        }
        total += count ?? 0;
      }
      if (!cancelled) setPendingCount(total);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, created_at, details')
        .eq('action', 'media_migration')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !logs?.length) {
        if (!cancelled) setHistory([]);
        return;
      }
      const userIds = [
        ...new Set(
          (logs as { user_id: string | null }[])
            .map(l => l.user_id)
            .filter((id): id is string => id !== null)
        ),
      ];
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('user_id, name').in('user_id', userIds)
        : { data: [] as { user_id: string; name: string }[] };
      if (!cancelled) {
        setHistory(
          (logs as LogEntry[]).map(log => ({
            ...log,
            user:
              (profiles as { user_id: string; name: string }[])?.find(
                p => p.user_id === log.user_id,
              ) ?? null,
          })),
        );
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    setRunning(true);
    setResult(null);
    setEdgeError(null);
    const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });
    setRunning(false);
    if (error) {
      const err = error as EdgeError;
      setEdgeError(err);
      toast.error(err.message ?? 'Erro ao executar migração');
    } else if (data) {
      const res = data as MigrationResult;
      setResult(res);
      if (res.migrated > 0) {
        toast.success(`${res.migrated} mídias migradas com sucesso!`);
      } else {
        toast.info(res.message ?? 'Nenhuma mídia para migrar');
      }
    } else {
      toast.info('Nenhuma mídia para migrar');
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex items-center gap-3">
        <HardDrive className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Migração de Mídia</h2>
          <p className="text-sm text-muted-foreground">
            Migrar mídias WhatsApp de CDN temporária para Storage permanente
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {countError ? (
          <p role="status" className="text-yellow-600 text-sm">
            Não foi possível contar as mídias pendentes
          </p>
        ) : pendingCount !== null ? (
          <p role="status" className="text-sm font-medium">
            {pendingCount} mídias pendentes
          </p>
        ) : null}

        <Button onClick={() => setDialogOpen(true)} disabled={running}>
          <Play className="w-4 h-4 mr-2" />
          Iniciar Migração
        </Button>
      </div>

      {running && (
        <div className="space-y-1">
          <Progress
            aria-label="Progresso da migração de mídia"
            aria-valuetext="Migrando mídias"
          />
          <p className="text-xs text-muted-foreground">
            o total só aparece quando a execução termina
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">Processados</p>
          <p>{result.processed} processados</p>
          <p>{result.migrated} migrados</p>
          <p>{result.failed} falhas</p>
        </div>
      )}

      {edgeError && (
        <div className="space-y-1 text-sm text-destructive">
          <p>{edgeError.message}</p>
          {edgeError.code && <p>Código do erro: {edgeError.code}</p>}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Histórico</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma migração registrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map(entry => (
              <li key={entry.id} className="flex gap-3 flex-wrap">
                <span className="font-medium">{entry.user?.name ?? 'Sistema'}</span>
                <span>{entry.details.processed} processados</span>
                <span>{entry.details.migrated} migrados</span>
                <span>{entry.details.failed} falhas</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCount !== null
                ? `${pendingCount} mídias aguardam migração`
                : 'Mídias aguardam migração'}
              . Processa até 50 mídias por execução.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Iniciar migração</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
