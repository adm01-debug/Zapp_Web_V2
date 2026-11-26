import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Database, RefreshCw, Timer, Trash2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatarBytes,
  LIMIAR_TAMANHO_BYTES,
  useLinkPreviewCacheMetrics,
} from '@/hooks/system/useLinkPreviewCacheMetrics';

function desde(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return 'data desconhecida';
  return formatDistanceToNow(data, { addSuffix: true, locale: ptBR });
}

function variacaoTexto(variacao: number | null): string {
  if (variacao === null) return 'sem execucao anterior para comparar';
  if (variacao === 0) return 'mesmo tamanho da limpeza anterior';
  const sinal = variacao > 0 ? '+' : '-';
  return `${sinal}${formatarBytes(Math.abs(variacao))} desde a limpeza anterior`;
}

export function LinkPreviewCachePanel() {
  const { runs, resumo, isLoading, error, refetch, isFetching } = useLinkPreviewCacheMetrics(true);

  return (
    <Card data-testid="cache-previas">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" aria-hidden />
              Cache de prévias de link
            </CardTitle>
            <CardDescription>
              Histórico das limpezas automáticas do cache: o que a rotina removeu, quanto sobrou e o
              tamanho da tabela a cada execução.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="cache-previas-atualizar"
          >
            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="cache-previas-carregando">
            Carregando histórico de limpezas…
          </p>
        ) : error ? (
          <Alert variant="destructive" data-testid="cache-previas-erro">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Não foi possível ler o histórico</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Erro desconhecido ao consultar as métricas.'}
            </AlertDescription>
          </Alert>
        ) : resumo.execucoes === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="cache-previas-vazio">
            A rotina de limpeza ainda não registrou nenhuma execução.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="cache-previas-resumo">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Tamanho na última limpeza</p>
                <p className="text-lg font-semibold" data-testid="cache-previas-tamanho">
                  {formatarBytes(resumo.ultima?.tamanhoBytes ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="cache-previas-variacao">
                  {variacaoTexto(resumo.variacaoTamanhoBytes)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Removidos na última limpeza</p>
                <p className="text-lg font-semibold" data-testid="cache-previas-removidos">
                  {resumo.ultima?.removidos ?? 0}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="cache-previas-restantes">
                  {resumo.ultima?.restantes ?? 0} linha(s) no cache depois dela
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Quando rodou</p>
                <p className="text-lg font-semibold" data-testid="cache-previas-quando">
                  {resumo.ultima ? desde(resumo.ultima.executadaEm) : 'nunca'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resumo.execucoes} execução(ões) no histórico
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Duração média</p>
                <p className="flex items-center gap-1 text-lg font-semibold" data-testid="cache-previas-duracao">
                  <Timer className="h-4 w-4" aria-hidden />
                  {resumo.mediaDuracaoMs} ms
                </p>
                <p className="text-xs text-muted-foreground">
                  pico de {formatarBytes(resumo.maiorTamanhoBytes)}
                </p>
              </div>
            </div>

            {resumo.acimaDoLimiar && (
              <Alert variant="destructive" data-testid="cache-previas-alerta">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <AlertTitle>Cache acima do limiar</AlertTitle>
                <AlertDescription>
                  A tabela de prévias passou de {formatarBytes(LIMIAR_TAMANHO_BYTES)} na última
                  limpeza — vale checar se a rotina está removendo as linhas expiradas.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Últimas limpezas</p>
              <ul className="space-y-2">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    data-testid={`cache-previas-execucao-${run.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span className="font-medium">{desde(run.executadaEm)}</span>
                    <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <Badge variant="secondary" className="gap-1">
                        <Trash2 className="h-3 w-3" aria-hidden />
                        {run.removidos} removido(s)
                      </Badge>
                      <span>{run.restantes} no cache</span>
                      <span>{formatarBytes(run.tamanhoBytes)}</span>
                      <span>{run.duracaoMs} ms</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
