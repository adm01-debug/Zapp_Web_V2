import { useState, useEffect } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
  ignored?: number;
}

interface MigrationDetails {
  processed: number;
  migrated: number;
  failed: number;
  ignored?: number;
}

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  created_at: string;
  details: MigrationDetails;
}

export function MediaMigrationTool() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [edgeError, setEdgeError] = useState<{ message: string; code: string } | null>(null);
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [mmgResult, ppsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://mmg.whatsapp.net/%'),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', 'https://pps.whatsapp.net/%'),
      ]);

      if (
        mmgResult.error ||
        mmgResult.count === null ||
        ppsResult.error ||
        ppsResult.count === null
      ) {
        setCountError(true);
      } else {
        setPendingCount(mmgResult.count + ppsResult.count);
      }

      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'media_migration')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!logsError && Array.isArray(logs)) {
        const typedLogs = logs.map((l) => ({
          id: l.id,
          user_id: l.user_id,
          created_at: l.created_at,
          details: l.details as unknown as MigrationDetails,
        }));
        setHistory(typedLogs);

        const userIds = [
          ...new Set(
            typedLogs
              .map((l) => l.user_id)
              .filter((id): id is string => id !== null),
          ),
        ];

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, name')
            .in('user_id', userIds);

          if (Array.isArray(profiles)) {
            const names: Record<string, string> = {};
            profiles.forEach((p) => {
              names[p.user_id] = p.name;
            });
            setProfileNames(names);
          }
        }
      }
    }

    void loadData();
  }, []);

  async function runMigration() {
    setRunning(true);
    setResult(null);
    setEdgeError(null);

    const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });

    setRunning(false);

    if (error) {
      const err = error as { message: string; code: string };
      setEdgeError(err);
      toast.error(err.message);
      return;
    }

    if (data) {
      const migrationResult = data as MigrationResult;
      setResult(migrationResult);
      toast.success(`${migrationResult.migrated} mídias migradas com sucesso!`);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Migração de Mídia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="status" aria-live="polite">
            {countError
              ? 'Não foi possível contar as mídias pendentes'
              : pendingCount !== null
                ? `${pendingCount} mídias pendentes`
                : 'Carregando...'}
          </div>

          {!running && (
            <Button onClick={() => setDialogOpen(true)}>
              Iniciar Migração
            </Button>
          )}

          {running && (
            <div className="space-y-2">
              <Progress
                aria-label="Progresso da migração de mídia"
                aria-valuetext="Migrando mídias"
              />
              <p className="text-sm text-muted-foreground">
                o total só aparece quando a execução termina
              </p>
            </div>
          )}

          {edgeError && (
            <div className="space-y-1 text-destructive">
              <p>{edgeError.message}</p>
              <p>Código do erro: {edgeError.code}</p>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <p className="font-medium">Processados</p>
              <div className="flex gap-4 text-sm">
                <span>{result.processed} processados</span>
                <span>{result.migrated} migrados</span>
                <span>{result.failed} falhas</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCount !== null
                ? `${pendingCount} mídias aguardam migração`
                : 'Mídias aguardam migração'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runMigration()}>
              Iniciar migração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Histórico de Migrações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p>Nenhuma migração registrada.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((log) => (
                <li key={log.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {log.user_id
                        ? (profileNames[log.user_id] ?? log.user_id)
                        : 'Sistema'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span>{log.details.processed} processados</span>
                    <span>{log.details.migrated} migrados</span>
                    <span>{log.details.failed} falhas</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
