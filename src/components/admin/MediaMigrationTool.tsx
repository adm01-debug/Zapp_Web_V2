import { useCallback, useEffect, useState } from 'react';
import { HardDrive, Play, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invokeEdge } from '@/lib/invokeEdge';
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

/** Prefixos de CDN temporária do WhatsApp — o mesmo filtro que a Edge `migrate-media-storage` usa. */
const CDN_TEMP_PREFIXES = ['https://mmg.whatsapp.net/', 'https://pps.whatsapp.net/'] as const;

/** Ação que a Edge grava em `audit_logs` ao fim de cada execução. */
const MIGRATION_ACTION = 'media_migration';

/** Quantas execuções o histórico mostra. */
const HISTORY_LIMIT = 10;

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
  details?: string[];
  message?: string;
  code?: string;
}

interface MigrationHistoryEntry {
  id: string;
  createdAt: string;
  authorName: string | null;
  processed: number;
  migrated: number;
  failed: number;
}

interface PendingCount {
  status: 'loading' | 'ready' | 'error';
  count: number;
}

interface HistoryState {
  status: 'loading' | 'ready' | 'error';
  entries: MigrationHistoryEntry[];
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Conta, sem trazer linhas (`head`), as mensagens que ainda apontam para a CDN temporária. */
async function countPendingMedia(): Promise<number> {
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

/** Histórico real: uma linha de `audit_logs` por execução da Edge (só contagens, sem URL). */
async function fetchMigrationHistory(): Promise<MigrationHistoryEntry[]> {
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

export function MediaMigrationTool() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [pending, setPending] = useState<PendingCount>({ status: 'loading', count: 0 });
  const [history, setHistory] = useState<HistoryState>({ status: 'loading', entries: [] });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const count = await countPendingMedia();
      setPending({ status: 'ready', count });
    } catch {
      setPending({ status: 'error', count: 0 });
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const entries = await fetchMigrationHistory();
      setHistory({ status: 'ready', entries });
    } catch {
      setHistory({ status: 'error', entries: [] });
    }
  }, []);

  useEffect(() => {
    // fetch-on-mount padrão (mesma exceção do NumberReputationMonitor): o estado
    // inicial já é `loading`; nada aqui é derivado de props para sincronizar.
    /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount padrão */
    void loadPending();
    void loadHistory();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadPending, loadHistory]);

  const refreshPending = () => {
    setPending((prev) => ({ status: 'loading', count: prev.count }));
    void loadPending();
  };

  const runMigration = async () => {
    setRunning(true);
    setResult(null);

    const { data, error } = await invokeEdge<MigrationResult>('migrate-media-storage', { method: 'POST' });

    if (error) {
      setResult({
        success: false,
        processed: 0,
        migrated: 0,
        failed: 0,
        message: error.message,
        code: error.code,
      });
      toast.error(error.message);
    } else {
      const migrationResult: MigrationResult = data ?? { success: true, processed: 0, migrated: 0, failed: 0 };
      setResult(migrationResult);
      if (migrationResult.migrated > 0) {
        toast.success(`${migrationResult.migrated} mídias migradas com sucesso!`);
      } else {
        toast.info(migrationResult.message || 'Nenhuma mídia para migrar');
      }
    }

    setRunning(false);
    await Promise.all([loadPending(), loadHistory()]);
  };

  const progress =
    result && result.processed > 0
      ? Math.round(((result.migrated + result.failed) / result.processed) * 100)
      : 0;

  const pendingLabel =
    pending.status === 'ready'
      ? `${pending.count} ${pending.count === 1 ? 'mídia aguarda' : 'mídias aguardam'} migração`
      : 'a contagem de mídias pendentes não está disponível agora';

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <HardDrive className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Migração de Mídia</h2>
          <p className="text-sm text-muted-foreground">Migrar mídias WhatsApp de CDN temporária para Storage permanente</p>
        </div>
      </div>

      {/* Action Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executar Migração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta ferramenta busca mensagens com URLs temporárias do WhatsApp (CDN) e faz o download
            e upload permanente para o Storage. URLs expiradas tentam recuperação via Evolution API.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Badge
              role="status"
              aria-live="polite"
              variant={pending.status === 'error' ? 'destructive' : 'secondary'}
            >
              {pending.status === 'loading'
                ? 'Contando mídias pendentes...'
                : pending.status === 'error'
                  ? 'Não foi possível contar as mídias pendentes'
                  : `${pending.count} ${pending.count === 1 ? 'mídia pendente' : 'mídias pendentes'}`}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={refreshPending}
              disabled={pending.status === 'loading'}
            >
              <RefreshCw className={pending.status === 'loading' ? 'w-3 h-3 motion-safe:animate-spin' : 'w-3 h-3'} />
              Atualizar contagem
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => setConfirmOpen(true)} disabled={running} className="gap-2">
              {running ? (
                <><Loader2 className="w-4 h-4 motion-safe:animate-spin" /> Migrando...</>
              ) : (
                <><Play className="w-4 h-4" /> Iniciar Migração</>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Processa até 50 mídias por execução
            </span>
          </div>

          {running && (
            <div className="space-y-2">
              <div
                role="progressbar"
                aria-label="Progresso da migração de mídia"
                aria-valuetext="Migrando mídias"
                className="h-2 w-full overflow-hidden rounded-full bg-secondary"
              >
                <div className="h-full w-full rounded-full bg-primary/60 motion-safe:animate-pulse" />
              </div>
              <p className="text-xs text-muted-foreground">
                Migrando mídias... o total só aparece quando a execução termina.
              </p>

            </div>
          )}
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive" />
              )}
              Resultado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.success && result.message && (
              <p className="text-sm text-destructive">{result.message}</p>
            )}

            {!result.success && result.code && (
              <p className="text-xs font-mono text-muted-foreground">Código do erro: {result.code}</p>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{result.processed}</p>
                <p className="text-xs text-muted-foreground">Processados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-success/5">
                <p className="text-2xl font-bold text-success">{result.migrated}</p>
                <p className="text-xs text-muted-foreground">Migrados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/5">
                <p className="text-2xl font-bold text-destructive">{result.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>

            {result.processed > 0 && (
              <Progress value={progress} className="h-2" aria-label="Progresso da última migração" />
            )}

            {result.success && result.message && (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            )}

            {result.details && result.details.length > 0 && (
              <div className="max-h-[300px] overflow-auto rounded-lg border bg-muted/30 p-3">
                {result.details.map((detail, i) => (
                  <p key={i} className="text-xs font-mono py-0.5">
                    {detail}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-5 h-5" /> Histórico de migrações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.status === 'loading' && (
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          )}
          {history.status === 'error' && (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
          )}
          {history.status === 'ready' && history.entries.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma migração registrada.</p>
          )}
          {history.entries.length > 0 && (
            <div className="space-y-2">
              {history.entries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-3 p-2 rounded border text-xs">
                  {entry.failed > 0 ? (
                    <XCircle className="w-3 h-3 text-destructive" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-success" />
                  )}
                  <span className="text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                  <span>{entry.authorName ?? 'Sistema'}</span>
                  <span>{entry.processed} processados</span>
                  <span className="text-success">{entry.migrated} migrados</span>
                  {entry.failed > 0 && <span className="text-destructive">{entry.failed} falhas</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLabel}. A execução processa até 50 mídias, baixa cada uma da CDN do WhatsApp e grava
              no Storage permanente. Pode levar alguns minutos e não é possível desfazer pela tela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void runMigration(); }}>Iniciar migração</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
