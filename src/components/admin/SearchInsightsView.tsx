/**
 * SearchInsightsView — HZ1-06
 *
 * Tela de admin com os KPIs da busca global (RPC `get_search_insights`):
 * total de buscas, taxa de clique, buscas sem resultado, top 10 consultas e
 * top 10 termos sem resultado. Leitura apenas — esta tela NÃO exporta, não
 * imprime, não copia e não baixa nada (a informação não sai do sistema).
 *
 * Acesso: a própria RPC nega quem não é admin/supervisor (42501); a rota é
 * gated pelo item de menu em NavigationService (STAFF_ROLES).
 *
 * Sem PII: os termos vêm normalizados pela RPC (`term_normalized`), nunca de
 * contato, telefone ou conversa.
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
  type SearchInsightTerm,
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

function TermTable({
  title,
  emptyMessage,
  rows,
  tone,
}: {
  title: string;
  emptyMessage: string;
  rows: SearchInsightTerm[];
  tone: 'default' | 'warning';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Termo</TableHead>
                <TableHead className="w-24 text-right">Buscas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.term}>
                  <TableCell className={tone === 'warning' ? 'text-warning' : undefined}>
                    {row.term}
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    {formatNumber(row.count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
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
            O que as pessoas procuram, o que não encontram e o que clicam — apenas termos normalizados, sem dados pessoais.
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              Termos sem resultado são lacunas de conteúdo: a busca aconteceu e nada apareceu — nenhum clique
              podia acontecer. Use a lista abaixo para decidir o que cadastrar ou documentar.
            </span>
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TermTable
              title="Mais buscadas"
              emptyMessage={
                data.total === 0
                  ? 'Nenhuma busca registrada no período.'
                  : 'Nenhum termo registrado no período.'
              }
              rows={data.topQueries}
              tone="default"
            />
            <TermTable
              title="Sem resultado"
              emptyMessage="Nenhum termo sem resultado no período."
              rows={data.noResultTerms}
              tone="warning"
            />
          </div>

          <p className="sr-only">
            {`Resumo do período de ${data.days} dia(s): ${formatNumber(data.total)} busca(s), ` +
              `${formatRate(data.clickRate)} de taxa de clique, ${formatNumber(data.noResults)} sem resultado ` +
              `(${formatRate(noResultRate)}), ${data.topQueries.length} termo(s) no topo das buscas e ` +
              `${data.noResultTerms.length} termo(s) sem resultado.`}
          </p>
        </>
      )}
    </div>
  );
}

export default SearchInsightsView;
