import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Ban, Check, RefreshCw, FileWarning, Loader2, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useQuarantineMedia, type QuarantineDecision, type QuarantineFilter, type QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const THREAT_COLORS: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
};

const DECISION_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  allowed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  deleted: 'bg-destructive/15 text-destructive',
  whitelisted: 'bg-primary/15 text-primary',
};

const DECISION_LABEL: Record<string, string> = {
  pending: 'Aguardando',
  allowed: 'Liberado',
  deleted: 'Excluído',
  whitelisted: 'Whitelist',
};

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
}

interface ConfirmAction {
  id: string;
  decision: QuarantineDecision;
  threat?: string | null;
}

export function QuarantinePanel() {
  const { records, loading, error, filter, setFilter, refresh, decide, pendingCount, total, notConfigured } = useQuarantineMedia();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [acting, setActing] = useState(false);

  const handleDecide = async () => {
    if (!confirm) return;
    setActing(true);
    try {
      await decide(confirm.id, confirm.decision);
      toast.success(
        confirm.decision === 'allowed'
          ? 'Mídia liberada'
          : confirm.decision === 'deleted'
            ? 'Mídia excluída permanentemente'
            : 'Adicionada à whitelist',
      );
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao aplicar decisão');
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-destructive/10">
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Quarentena de Mídias
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Mídias bloqueadas pelo ClamAV (3 camadas, 47 regras heurísticas + hash).
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar quarentena">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as QuarantineFilter)}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="pending">Pendentes</TabsTrigger>
              <TabsTrigger value="allowed">Liberadas</TabsTrigger>
              <TabsTrigger value="deleted">Excluídas</TabsTrigger>
              <TabsTrigger value="whitelisted">Whitelist</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>
          </Tabs>

          {notConfigured && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <ShieldOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Banco externo não configurado</p>
                <p className="text-muted-foreground">Defina <code>EXTERNAL_SUPABASE_URL</code> e <code>EXTERNAL_SUPABASE_ANON_KEY</code> para consumir a tabela <code>media_quarantine</code>.</p>
              </div>
            </div>
          )}

          {error && !notConfigured && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              {error}
            </div>
          )}

          <ScrollArea className="h-[480px] -mx-2 px-2">
            {loading && records.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={`q-skel-${i}`} className="h-24 w-full" />)}
              </div>
            ) : records.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <div className="space-y-2">
                {records.map((r) => (
                  <QuarantineRow key={r.id} record={r} onAct={setConfirm} />
                ))}
                {total > records.length && (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    Exibindo {records.length} de {total} registros
                  </p>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && !acting && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.decision === 'deleted' && 'Excluir mídia permanentemente?'}
              {confirm?.decision === 'allowed' && 'Liberar esta mídia?'}
              {confirm?.decision === 'whitelisted' && 'Adicionar à whitelist?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.decision === 'deleted' && `A mídia será removida do storage. Ameaça detectada: ${confirm.threat || 'desconhecida'}. Esta ação não pode ser desfeita.`}
              {confirm?.decision === 'allowed' && 'A mídia será marcada como segura e ficará acessível ao usuário final.'}
              {confirm?.decision === 'whitelisted' && 'O hash desta mídia será ignorado em scans futuros (todas as origens).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDecide(); }}
              disabled={acting}
              className={confirm?.decision === 'deleted' ? 'bg-destructive hover:bg-destructive/90' : undefined}
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyState({ filter }: { filter: QuarantineFilter }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldCheck className="w-12 h-12 text-emerald-500/50 mb-3" />
      <p className="text-sm font-medium">
        {filter === 'pending' ? 'Nenhuma mídia aguardando revisão' : 'Nenhum registro nesta visualização'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {filter === 'pending' ? 'O sistema antivírus está em dia.' : 'Mude o filtro acima para ver outros registros.'}
      </p>
    </div>
  );
}

interface QuarantineRowProps {
  record: QuarantineRecord;
  onAct: (action: ConfirmAction) => void;
}

function QuarantineRow({ record, onAct }: QuarantineRowProps) {
  const threatKey = (record.threat_level || '').toLowerCase();
  const decisionKey = (record.decision || 'pending').toLowerCase();
  const isPending = decisionKey === 'pending';

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 hover:bg-card transition-colors">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-destructive/10 shrink-0">
          <FileWarning className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {record.threat_name || 'Ameaça não classificada'}
            </span>
            {record.threat_level && (
              <Badge variant="outline" className={cn('text-[10px] uppercase', THREAT_COLORS[threatKey] || '')}>
                {threatKey}
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[10px]', DECISION_COLORS[decisionKey] || '')}>
              {DECISION_LABEL[decisionKey] || decisionKey}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span>{record.mime_type || record.media_type || 'desconhecido'}</span>
            <span>{formatBytes(record.file_size)}</span>
            {record.remote_jid && <span className="font-mono truncate max-w-[200px]">{record.remote_jid}</span>}
            {record.scan_engine && <span>via {record.scan_engine}</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatDate(record.created_at)}
            {record.file_hash && (
              <span className="ml-2 font-mono opacity-60">{record.file_hash.slice(0, 12)}…</span>
            )}
          </div>
        </div>
        {isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
              onClick={() => onAct({ id: record.id, decision: 'allowed', threat: record.threat_name })}
              aria-label="Liberar mídia"
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-primary hover:bg-primary/10"
              onClick={() => onAct({ id: record.id, decision: 'whitelisted', threat: record.threat_name })}
              aria-label="Adicionar à whitelist"
            >
              <ShieldCheck className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:bg-destructive/10"
              onClick={() => onAct({ id: record.id, decision: 'deleted', threat: record.threat_name })}
              aria-label="Excluir mídia"
            >
              <Ban className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}