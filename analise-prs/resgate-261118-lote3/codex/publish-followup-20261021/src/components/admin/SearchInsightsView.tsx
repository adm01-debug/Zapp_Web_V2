/**
 * SearchInsightsView — HZ1-06
 *
 * Tela de admin com os agregados da busca global (RPC `search_insights`):
 * total, média de tamanho, cliques, buscas sem resultado e tipos clicados.
 * O termo não é persistido; a tela não tenta reconstruir nem expor consultas.
 *
 * Acesso: a própria RPC nega quem não é admin/supervisor (42501); a rota é
 * gated pelo item de menu em NavigationService (STAFF_ROLES).
 *
 * Privacidade: eventos têm user_id e data/hora, mas nunca armazenam texto livre.
 * O acesso aos agregados é restrito à própria RPC para admin/supervisor.
 */
import { useState } from 'react';
import { SearchCheck, MousePointerClick, SearchX, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DEFAULT_SEARCH_INSIGHTS_PERIOD,
  SEARCH_INSIGHTS_PERIODS,
  useSearchInsights,
  type SearchInsightsPeriod,
} from '@/hooks/admin/useSearchInsights';

const PERIOD_LABELS: Record<SearchInsightsPeriod, string> = {
  7: 'Últimos 7 dias',
  30: 'Últimos 30 dias',
  90: 'Últimos 90 dias',
};

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

/** Fração 0..1 → "42,0%". */
function formatRate(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function SearchInsightsView() {
  const [days, setDays] = useState<SearchInsightsPeriod>(DEFAULT_SEARCH_INSIGHTS_PERIOD);
  const { data, isLoading, isError, error, refetch } = useSearchInsights(days);

  const errorMessage = error instanceof Error
    ? error.message
    : 'A consulta falhou. Tente novamente.';

  const noResultRate = data && data.total > 0 ? data.noResults / data.total : 0;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <SearchCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            Insights de Busca
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão agregada de uso; o texto digitado não é armazenado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value) as SearchInsightsPeriod)}>
            <SelectTrigger className="w-[170px]" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_INSIGHTS_PERIODS.map((period) => (
                <SelectItem key={period} value={String(period)}>
                  {PERIOD_LABELS[period]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            aria-label="Atualizar insights de busca"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isError && (
        <Card role="alert">
          <CardContent className="space-y-2 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Não foi possível carregar os insights de busca</p>
            <p className="text-xs text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2 pt-4 pb-3">
                <Skeleton className="h-3 w-24" delay={i * 80} />
                <Skeleton className="h-7 w-20" delay={i * 80} />
              </CardContent>
            </Card>
          ))}
          <span className="sr-only">Carregando insights de busca…</span>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" /> Buscas
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(data.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" /> Tamanho médio do termo
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{data.averageTermLength.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
                <p className="text-xs text-muted-foreground">caracteres por busca</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> Taxa de clique
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatRate(data.clickRate)}</p>
                <p className="text-xs text-muted-foreground">{formatNumber(data.clicks)} clique(s)</p>
              </CardContent>
            </Card>
            {/* Destaque: é aqui que se enxerga a lacuna de conteúdo. */}
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <SearchX className="h-3.5 w-3.5" aria-hidden="true" /> Buscas sem resultado
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatRate(noResultRate)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(data.noResults)} de {formatNumber(data.total)} busca(s)
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              A coleta não guarda os termos pesquisados nem permite listar buscas individuais. As métricas abaixo
              são agregadas; os tipos indicam apenas resultados que receberam clique.
            </span>
          </p>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cliques por tipo de resultado</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(data.searchesByKind).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {data.total === 0 ? 'Nenhuma busca registrada no período.' : 'Nenhum clique por tipo registrado no período.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Tipo de resultado</TableHead><TableHead className="w-24 text-right">Cliques</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.searchesByKind).sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => (
                      <TableRow key={kind}>
                        <TableCell>{kind}</TableCell>
                        <TableCell className="text-right font-medium text-foreground">{formatNumber(count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="sr-only">
            {`Resumo do período de ${data.days} dia(s): ${formatNumber(data.total)} busca(s), ` +
              `${formatRate(data.clickRate)} de taxa de clique, ${formatNumber(data.noResults)} sem resultado ` +
              `(${formatRate(noResultRate)}), tamanho médio de ${data.averageTermLength} caracteres; ` +
              `nenhum termo individual é armazenado.`}
          </p>
        </>
      )}
    </div>
  );
}

export default SearchInsightsView;
