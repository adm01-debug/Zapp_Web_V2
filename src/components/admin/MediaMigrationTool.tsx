import { useState, useEffect } from 'react';
import { HardDrive, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';

const CDN_PREFIXES = [
  'https://mmg.whatsapp.net/%',
  'https://pps.whatsapp.net/%',
];

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
  message?: string;
}

interface EdgeError {
  message: string;
  code?: string;
  status?: number;
}

interface AuditEntry {
  id: string;
  user_id: string | null;
  created_at: string;
  details: { processed: number; migrated: number; failed: number; ignored?: number } | null;
}

interface Profile {
  user_id: string;
  name: string;
}

export function MediaMigrationTool() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [edgeError, setEdgeError] = useState<EdgeError | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function countPending() {
      let total = 0;
      for (const prefix of CDN_PREFIXES) {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .like('media_url', prefix);
        if (error) {
          setCountError(true);
          return;
        }
        total += count ?? 0;
      }
      setPendingCount(total);
    }

    async function loadHistory() {
      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('id, user_id, created_at, details')
        .eq('action', 'media_migration')
        .order('created_at', { ascending: false })
        .limit(10);

      if (logsError) {
        setHistoryError(true);
        return;
      }

      if (!logs || logs.length === 0) return;

      setHistory(logs as AuditEntry[]);

      const userIds = [...new Set((logs as AuditEntry[]).map((l) => l.user_id).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', userIds);
        if (profs) {
          const map = new Map<string, string>();
          (profs as Profile[]).forEach((p) => map.set(p.user_id, p.name));
          setProfiles(map);
        }
      }
    }

    void countPending();
    void loadHistory();
  }, []);

  const runMigration = async () => {
    setRunning(true);
    setResult(null);
    setEdgeError(null);
    try {
      const { data, error } = await invokeEdge('migrate-media-storage', { method: 'POST' });

      if (error) {
        const err = error as EdgeError;
        setEdgeError(err);
        toast.error(err.message ?? 'Erro ao executar migração');
        return;
      }

      if (!data) {
        toast.info('Nenhuma mídia para migrar');
        return;
      }

      const migrationResult = data as MigrationResult;
      setResult(migrationResult);

      if (migrationResult.migrated > 0) {
        toast.success(`${migrationResult.migrated} mídias migradas com sucesso!`);
      } else {
        toast.info(migrationResult.message || 'Nenhuma mídia para migrar');
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : null) ?? 'Erro inesperado na migração';
      setEdgeError({ message: msg });
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const countDisplay = countError
    ? 'Não foi possível contar as mídias pendentes'
    : pendingCount !== null
      ? `${pendingCount} mídias pendentes`
      : null;

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

          {countDisplay !== null && (
            <p
              role="status"
              className={`text-sm font-medium ${countError ? 'text-warning' : 'text-foreground'}`}
            >
              {countDisplay}
            </p>
          )}

          <div className="flex items-center gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={running} className="gap-2">
                  {running ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Migrando...</>
                  ) : (
                    <>Iniciar Migração</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Iniciar a migração de mídia?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingCount !== null
                      ? `${pendingCount} mídias aguardam migração. Esta operação pode demorar alguns minutos.`
                      : 'Esta operação pode demorar alguns minutos.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={runMigration}>Iniciar migração</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <span className="text-xs text-muted-foreground">
              Processa até 50 mídias por execução
            </span>
          </div>

          {running && (
            <div className="space-y-2">
              <Progress
                className="h-2"
                aria-label="Progresso da migração de mídia"
                aria-valuetext="Migrando mídias"
              />
              <p className="text-xs text-muted-foreground">
                Processando mídias — o total só aparece quando a execução termina.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edge error */}
      {edgeError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <XCircle className="w-5 h-5" /> Erro na migração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{edgeError.message}</p>
            {edgeError.code && (
              <p className="text-xs text-muted-foreground">Código do erro: {edgeError.code}</p>
            )}
          </CardContent>
        </Card>
      )}

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
            {result.message && (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* History from audit_logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-5 h-5" /> Histórico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyError ? (
            <p className="text-sm text-destructive">Erro ao carregar histórico de migrações.</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma migração registrada.</p>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => {
                const d = entry.details;
                const author = entry.user_id ? (profiles.get(entry.user_id) ?? entry.user_id) : 'Sistema';
                const when = new Date(entry.created_at).toLocaleString('pt-BR');
                return (
                  <div key={entry.id} className="flex flex-wrap items-center gap-3 p-2 rounded border text-xs">
                    <span className="font-medium">{author}</span>
                    <span className="text-muted-foreground">{when}</span>
                    {d && (
                      <>
                        <span>{d.processed} processados</span>
                        <span className="text-success">{d.migrated} migrados</span>
                        {d.failed > 0 && <span className="text-destructive">{d.failed} falhas</span>}
                        {d.ignored != null && d.ignored > 0 && (
                          <span className="text-muted-foreground">{d.ignored} ignorados</span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
