import { useState } from 'react';
import { HardDrive, Play, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  failed: number;
  details?: string[];
  message?: string;
}

export function MediaMigrationTool() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [history, setHistory] = useState<MigrationResult[]>([]);

  const runMigration = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-media-storage', {
        method: 'POST',
      });

      if (error) throw error;

      const migrationResult = data as MigrationResult;
      setResult(migrationResult);
      setHistory(prev => [migrationResult, ...prev.slice(0, 9)]);

      if (migrationResult.migrated > 0) {
        toast.success(`${migrationResult.migrated} mídias migradas com sucesso!`);
      } else {
        toast.info(migrationResult.message || 'Nenhuma mídia para migrar');
      }
    } catch (err) {
      const errorResult: MigrationResult = {
        success: false,
        processed: 0,
        migrated: 0,
        failed: 0,
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      };
      setResult(errorResult);
      toast.error('Erro ao executar migração');
    } finally {
      setRunning(false);
    }
  };

  const progress = result ? (result.processed > 0 ? Math.round(((result.migrated + result.failed) / result.processed) * 100) : 100) : 0;

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

          <div className="flex items-center gap-3">
            <Button onClick={runMigration} disabled={running} className="gap-2">
              {running ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Migrando...</>
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
              <Progress value={30} className="h-2" />
              <p className="text-xs text-muted-foreground animate-pulse">Processando mídias...</p>
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
              <Progress value={progress} className="h-2" />
            )}

            {result.message && (
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
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="w-5 h-5" /> Histórico da Sessão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(1).map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded border text-xs">
                  {h.success ? <CheckCircle className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-destructive" />}
                  <span>{h.processed} processados</span>
                  <span className="text-success">{h.migrated} OK</span>
                  {h.failed > 0 && <span className="text-destructive">{h.failed} falhas</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
