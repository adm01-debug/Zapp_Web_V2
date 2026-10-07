import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock, Zap, TrendingUp, Sparkles, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { format, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UsageLog {
  id: string;
  function_name: string;
  model: string | null;
  status: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/** Janela da amostra: declarada, nao implicita. */
const HORAS_DA_JANELA = 24;

/**
 * Percentil por interpolacao linear sobre os valores ORDENADOS e MEDIDOS.
 * Nao existe percentil de lista vazia — devolve null, nao zero: zero afirmaria
 * "mediu e deu zero", que e outra coisa.
 */
function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  if (ordenados.length === 1) return ordenados[0];
  const posicao = (ordenados.length - 1) * p;
  const base = Math.floor(posicao);
  const resto = posicao - base;
  const proximo = ordenados[base + 1];
  return proximo === undefined
    ? ordenados[base]
    : Math.round(ordenados[base] + resto * (proximo - ordenados[base]));
}

export function AIProviderHealthPanel() {
  const desde = subHours(new Date(), HORAS_DA_JANELA).toISOString();

  // R2-API-043: a consulta NAO filtra por `function_name = 'ai-proxy'`. O
  // roteador central (`generateWithRouting`) grava o nome da FUNCAO CHAMADORA
  // em `ai_usage_logs.function_name` (voice-agent, ai-auto-tag, classify-*,
  // chatbot-l1, ...); filtrar so por `ai-proxy` escondia a atividade real das
  // funcoes modernas e fazia o painel declarar "nenhuma chamada observada".
  // Painel "Saude dos Provedores": cobre TODAS as funcoes de IA do ledger.
  const { data: recentLogs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ai-provider-health', HORAS_DA_JANELA],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        // Janela REAL: sem o recorte, "ultimas 50" seria uma amostra sem periodo.
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as UsageLog[];
    },
    refetchInterval: 30000,
  });

  const sucessos = recentLogs.filter(l => l.status === 'success').length;
  const falhas = recentLogs.filter(l => l.status === 'error').length;
  // status 'fallback' = a chamada foi ATENDIDA por outro provedor: e recuperacao,
  // nao erro. Por isso nao entra na conta de erro nem some da de sucesso.
  const recuperadasPorFallback = recentLogs.filter(l => l.status === 'fallback').length;

  // Duracoes MEDIDAS. As sem medicao sao contadas ao lado em vez de virarem zero
  // (trata-las como zero puxaria a estatistica para baixo e mentiria).
  const duracoes = recentLogs
    .map(l => l.duration_ms)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
  const semMedicaoDeDuracao = recentLogs.length - duracoes.length;

  const total = recentLogs.length;
  const p50 = percentil(duracoes, 0.5);
  const p95 = percentil(duracoes, 0.95);

  // ACEITE DA IA-057: sem observacoes NAO existe taxa. `null` (e nao um numero
  // qualquer) porque nao houve observacao nenhuma para concluir nada.
  const taxaDeSucesso = total > 0 ? Math.round((sucessos / total) * 100) : null;
  // Disponibilidade olha so as chamadas que terminaram em sucesso ou erro: uma
  // chamada servida por fallback nao e indisponibilidade.
  const comDesfechoProprio = sucessos + falhas;
  const disponibilidade = comDesfechoProprio > 0
    ? Math.round((sucessos / comDesfechoProprio) * 100)
    : null;

  const tokens = recentLogs.reduce((soma, l) => soma + (l.total_tokens || 0), 0);

  const corDaTaxa = (v: number | null) =>
    v === null ? 'text-muted-foreground' : v >= 95 ? 'text-emerald-500' : v >= 80 ? 'text-amber-500' : 'text-destructive';
  const iconeDaTaxa = (v: number | null) =>
    v === null ? MinusCircle : v >= 95 ? CheckCircle : v >= 80 ? AlertTriangle : XCircle;

  const kpis = [
    {
      label: 'Taxa de Sucesso',
      valor: taxaDeSucesso === null ? '—' : `${taxaDeSucesso}%`,
      icone: iconeDaTaxa(taxaDeSucesso),
      cor: corDaTaxa(taxaDeSucesso),
      sub: total > 0 ? `${sucessos} de ${total}` : 'sem observações',
    },
    {
      label: 'Disponibilidade',
      valor: disponibilidade === null ? '—' : `${disponibilidade}%`,
      icone: iconeDaTaxa(disponibilidade),
      cor: corDaTaxa(disponibilidade),
      sub: comDesfechoProprio > 0 ? `${comDesfechoProprio} com desfecho` : 'sem desfecho',
    },
    {
      label: 'Latência p50 · p95',
      valor: p50 === null ? '—' : `${p50}ms · ${p95}ms`,
      icone: Clock,
      cor: p50 === null ? 'text-muted-foreground' : p95 !== null && p95 < 5000 ? 'text-emerald-500' : 'text-amber-500',
      sub: semMedicaoDeDuracao > 0 ? `${semMedicaoDeDuracao} sem medição` : `${duracoes.length} medidas`,
    },
    {
      label: 'Erros',
      valor: String(falhas),
      icone: falhas === 0 ? CheckCircle : XCircle,
      cor: total === 0 ? 'text-muted-foreground' : falhas === 0 ? 'text-emerald-500' : 'text-destructive',
      sub: total > 0 ? `de ${total}` : 'sem observações',
    },
    {
      label: 'Recuperadas por fallback',
      valor: String(recuperadasPorFallback),
      icone: AlertTriangle,
      cor: total === 0 ? 'text-muted-foreground' : recuperadasPorFallback === 0 ? 'text-emerald-500' : 'text-amber-500',
      sub: recuperadasPorFallback > 0 ? 'atendidas por outro provedor' : 'nenhuma',
    },
    {
      label: 'Tokens Usados',
      valor: tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens),
      icone: Zap,
      cor: 'text-primary',
      sub: total > 0 ? 'na amostra' : 'sem observações',
    },
  ];

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="w-3.5 h-3.5 rounded" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // R2-API-043: erro de LEITURA nao pode se passar por "sem dados". Falha de
  // consulta e amostra vazia sao afirmacoes diferentes — a primeira diz "nao
  // consegui olhar", a segunda diz "olhei e nao havia nada".
  if (isError) {
    const mensagemDeErro = error instanceof Error ? error.message : String(error ?? '');
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            Saúde dos Provedores
            <Badge variant="outline" className="ml-auto text-xs font-normal">erro de leitura</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div role="alert" className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-2xl bg-destructive/10 mb-3">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Não foi possível ler o histórico de chamadas de IA
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[360px]">
              A leitura de <code>ai_usage_logs</code> falhou. Isto NÃO significa que não houve
              chamadas — significa que não foi possível observá-las.
              {mensagemDeErro && <> ({mensagemDeErro})</>}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sem observacao nenhuma, o painel NAO mostra KPI: qualquer numero aqui seria
  // afirmacao sobre dado que nao existe — e "100%" era exatamente isso.
  if (total === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            Saúde dos Provedores
            <Badge variant="outline" className="ml-auto text-xs font-normal">sem dados</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-2xl bg-primary/5 mb-3">
              <Sparkles className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Sem dados nas últimas {HORAS_DA_JANELA}h</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[320px]">
              Nenhuma chamada de IA foi observada nesta janela. Não há taxa, latência nem
              disponibilidade a exibir — e nada aqui deve ser lido como sucesso.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-primary" />
          Saúde dos Provedores
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            amostra de {total} chamadas · últimas {HORAS_DA_JANELA}h
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border/50 p-3 bg-card"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icone className={cn('w-3.5 h-3.5', kpi.cor)} />
                <span className="text-2xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className={cn('text-lg font-bold', kpi.cor)}>{kpi.valor}</p>
              <p className="text-3xs text-muted-foreground/70 mt-0.5">{kpi.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Declaracao: sobre o que os numeros foram calculados. */}
        <p className="text-xs text-muted-foreground">
          {total} chamadas observadas
          {recentLogs[recentLogs.length - 1] && recentLogs[0] && (
            <> de {format(new Date(recentLogs[recentLogs.length - 1].created_at), 'dd/MM HH:mm', { locale: ptBR })} a {format(new Date(recentLogs[0].created_at), 'dd/MM HH:mm', { locale: ptBR })}</>
          )}
          {' • '}amostra das {50} mais recentes da janela, de todas as funções de IA
          {semMedicaoDeDuracao > 0 && <> • {semMedicaoDeDuracao} sem medição de duração (não contadas como 0ms)</>}
          {recuperadasPorFallback > 0 && <> • {recuperadasPorFallback} atendidas por fallback contam como recuperação, não como erro</>}
        </p>

        {/* Recent calls log */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Chamadas Recentes
          </p>
          {recentLogs.slice(0, 10).map(log => {
            const providerType = (log.metadata as Record<string, unknown>)?.provider_type as string || 'lovable_ai';
            const isFallback = log.status === 'fallback';
            return (
              <div
                key={log.id}
                className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                {log.status === 'success' ? (
                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : log.status === 'fallback' ? (
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-destructive shrink-0" />
                )}
                <span className="text-muted-foreground truncate max-w-[140px]">
                  {log.function_name}
                </span>
                <span aria-hidden="true" className="text-muted-foreground shrink-0">·</span>
                <span className="text-muted-foreground truncate flex-1">
                  {providerType}{isFallback && ' → fallback'}
                </span>
                {log.model && (
                  <span className="font-mono text-3xs text-muted-foreground/70 truncate max-w-[120px]">
                    {log.model}
                  </span>
                )}
                <span className="text-muted-foreground shrink-0">
                  {log.duration_ms === null ? 'sem medição' : `${log.duration_ms}ms`}
                </span>
                <span className="text-muted-foreground/40 shrink-0">
                  {format(new Date(log.created_at), 'HH:mm', { locale: ptBR })}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
