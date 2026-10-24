import { useMemo, useState } from 'react';
import { AlertTriangle, Bug, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClientErrors } from '@/hooks/system/useClientErrors';
import { cn } from '@/lib/utils';
import { formatTime, periodStartIso } from './telemetryUtils';
import type { TimeFilter } from './telemetryTypes';

type ClientErrorsPeriod = Exclude<TimeFilter, 'custom'>;

const PERIOD_LABELS: Record<ClientErrorsPeriod, string> = {
  '1h': 'Última hora',
  '6h': 'Últimas 6h',
  '24h': 'Últimas 24h',
  '7d': 'Últimos 7 dias',
};

/**
 * Aba "Navegador": erros de runtime do cliente (audit_logs action=client_error) agrupados
 * por mensagem normalizada e rota, com contagem e última ocorrência. Sem exportação — a
 * regra do dono proíbe tirar informação do sistema; a tela só lê e mostra.
 */
export function ClientErrorsPanel() {
  const [period, setPeriod] = useState<ClientErrorsPeriod>('24h');
  const sinceIso = useMemo(() => periodStartIso(period), [period]);
  const { groups, totalErrors, incomplete, loading, isError, error, refetch, isRefetching } =
    useClientErrors(sinceIso);

  const estado = loading
    ? 'carregando'
    : isError
      ? groups.length > 0 ? 'defasado' : 'falha'
      : groups.length > 0 ? 'dados' : 'vazio';

  const rotaMaisAfetada = groups.reduce<{ route: string; count: number } | null>((acc, g) => {
    if (!acc || g.count > acc.count) return { route: g.route, count: g.count };
    return acc;
  }, null);

  const detalheFalha =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : 'A leitura não retornou o detalhe do erro.';

  return (
    <div className="space-y-6" data-client-errors={estado}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bug className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Erros do Navegador</h2>
            <p className="text-sm text-muted-foreground">
              Erros de runtime do cliente agrupados por mensagem normalizada e rota.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as ClientErrorsPeriod)}>
            <SelectTrigger className="w-44" aria-label="Período dos erros do navegador">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as ClientErrorsPeriod[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isRefetching && 'motion-safe:animate-spin')} />Atualizar
          </Button>
        </div>
      </div>

      {isError && (
        <div
          data-client-errors-falha={groups.length > 0 ? 'defasado' : 'falha'}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <div className="text-xs text-foreground">
            <p className="font-medium">
              {groups.length > 0
                ? 'A atualização dos erros do navegador falhou: os números abaixo são da última leitura bem-sucedida e podem estar defasados.'
                : 'Não foi possível ler os erros do navegador.'}
            </p>
            <p className="text-muted-foreground">{detalheFalha}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isRefetching && 'motion-safe:animate-spin')} />Tentar novamente
          </Button>
        </div>
      )}

      {!loading && !isError && incomplete && (
        <div data-client-errors-incompleto="true" role="status" className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          O período tem mais erros do que a leitura cobre: os números abaixo somam só as
          ocorrências lidas, não o período inteiro.
        </div>
      )}

      {!isError && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold tabular-nums">{totalErrors}</p>
              <p className="text-xs text-muted-foreground">Ocorrências no período</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold tabular-nums">{groups.length}</p>
              <p className="text-xs text-muted-foreground">Grupos distintos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm font-bold truncate" title={rotaMaisAfetada?.route}>
                {rotaMaisAfetada ? rotaMaisAfetada.route : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {rotaMaisAfetada ? `Rota mais afetada (${rotaMaisAfetada.count})` : 'Rota mais afetada'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Grupos de erro ({groups.length})
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              período: {PERIOD_LABELS[period]}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bug className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Nenhum erro do navegador no período</p>
              <p className="text-xs mt-1">Nada reportado por este cliente de navegador.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Mensagem</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Rota</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Ocorrências</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Sessões</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Última ocorrência</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-xs truncate max-w-[420px]" title={g.message}>{g.message}</td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]" title={g.route}>{g.route}</td>
                      <td className="p-3 text-right">
                        <Badge variant="outline" className="text-[10px] tabular-nums">{g.count}</Badge>
                      </td>
                      <td className="p-3 text-right text-xs tabular-nums text-muted-foreground">{g.sessions || '-'}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {g.lastSeenIso ? formatTime(g.lastSeenIso) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
