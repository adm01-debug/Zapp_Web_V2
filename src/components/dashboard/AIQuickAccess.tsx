import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, FileText, Bell, ArrowRight, ChevronRight, Clock, Lightbulb, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { classifySentiment, type SentimentClass } from '@/lib/sentiment-classes';
import { AI_FEATURES, useAIFeatureNavigation } from './aiFeatures';
import { useAIStats } from '@/hooks/analytics/useAIStats';
import { useActiveAIProvider } from '@/hooks/analytics/useActiveAIProvider';
import { useRecentAnalyses, useAIInsights, type InsightPeriod } from '@/hooks/analytics/useRecentAnalyses';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { DashboardCard, SectionHeader, VerTodasButton, Pill, CardSelect } from './overview/DashboardCard';

/** Copy de UI do link de cada card — feature.action/route são chaves internas de navegação, não texto de exibição. */
const FEATURE_CTA: Record<string, string> = {
  suggestions: 'Usar agora',
  analysis: 'Ver análise',
  sentiment: 'Configurar',
  summary: 'Gerar resumo',
  transcription: 'Transcrever',
  trends: 'Ver tendências',
};

/** Tile sólido por feature (mockup: azul, azul, vermelho, verde, violeta, âmbar). */
const FEATURE_TILE: Record<string, string> = {
  suggestions: 'bg-dash-tile-blue',
  analysis: 'bg-primary',
  sentiment: 'bg-dash-tile-red',
  summary: 'bg-dash-tile-green',
  transcription: 'bg-dash-tile-violet',
  trends: 'bg-dash-tile-amber',
};

const INSIGHT_PERIODS: { value: InsightPeriod; label: string }[] = [
  { value: '24h', label: 'Últimas 24 horas' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

const SENTIMENT_RESULT_LABEL: Record<SentimentClass, string> = {
  positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo',
};
const SENTIMENT_RESULT_TONE: Record<SentimentClass, 'success' | 'muted' | 'danger'> = {
  positivo: 'success', neutro: 'muted', negativo: 'danger',
};

function SentimentResult({ sentiment }: { sentiment: unknown }) {
  const sentimentClass = classifySentiment(sentiment);
  return sentimentClass
    ? <Pill label={SENTIMENT_RESULT_LABEL[sentimentClass]} tone={SENTIMENT_RESULT_TONE[sentimentClass]} />
    : <span className="text-muted-foreground">—</span>;
}

function TrendText({ trend, label }: { trend?: { direction: 'up' | 'down' | 'stable'; percentage: number }; label: string }) {
  if (!trend || trend.direction === 'stable') return <p className="text-xs text-muted-foreground">{label}</p>;
  const up = trend.direction === 'up';
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <div className="text-right">
      <p className={cn('flex items-center justify-end gap-1 text-[13px] font-semibold', up ? 'text-dash-green' : 'text-dash-red')}>
        <Arrow className="w-3.5 h-3.5" />{up ? '+' : '-'}{Math.round(trend.percentage)}%
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function AIQuickAccess({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const navigate = useNavigate();
  const handleFeatureClick = useAIFeatureNavigation();
  const { data: aiStats } = useAIStats(30);
  const { data: provider } = useActiveAIProvider();
  const [insightPeriod, setInsightPeriod] = useState<InsightPeriod>('24h');
  // DASH-CONTROLS-001: os dois cards da linha final leem conversation_analyses —
  // a lista recente e os insights mudam quando o período selecionado muda.
  const { data: recentAnalyses = [] } = useRecentAnalyses(5);
  const { data: insights } = useAIInsights(insightPeriod);

  const totalAnalyses = aiStats?.totalAnalyses ?? 0;
  const analysesTrend = aiStats?.trends.analyses;
  const activeAlerts = aiStats?.activeAlerts?.length ?? 0;
  const alertsTrend = aiStats?.trends.negative;

  return (
    <div className="space-y-4">
      {/* Linha 1 — 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardCard testid="ai-model-card" variant="comfortable" className="flex-row items-center gap-4 cursor-pointer" onClick={() => navigateToView('settings')}>
          <div className="w-14 h-14 rounded-2xl bg-dash-tile-green flex items-center justify-center shrink-0">
            <Cpu className="w-[26px] h-[26px] text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Modelo de IA Ativo</p>
            {provider ? (
              <>
                <p className="text-lg font-bold text-foreground truncate leading-tight mt-0.5">{provider.model ?? provider.name}</p>
                <p className="text-xs text-muted-foreground truncate">{provider.description ?? provider.name}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-foreground truncate leading-tight mt-0.5">Nenhum modelo</p>
                <p className="text-xs text-muted-foreground truncate">Configure um provedor de IA em Configurações</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {provider && <Pill label="Ativo" tone="success" dot />}
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </DashboardCard>

        <DashboardCard testid="ai-analyses-card" variant="comfortable" className="flex-row items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-dash-tile-blue flex items-center justify-center shrink-0">
            <FileText className="w-[26px] h-[26px] text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Análises Disponíveis</p>
            <p className="text-3xl font-bold text-foreground tabular-nums leading-none mt-1">{totalAnalyses.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground mt-1">Processamentos este mês</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 border-l border-border/60 pl-4">
            <TrendText trend={analysesTrend} label="vs. mês anterior" />
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </DashboardCard>

        <DashboardCard testid="ai-alerts-card" variant="comfortable" className="flex-row items-center gap-4 cursor-pointer"
          onClick={() => onNavigateTab ? onNavigateTab('sentiment') : navigateToView('inbox')}>
          <div className="w-14 h-14 rounded-2xl bg-dash-tile-amber flex items-center justify-center shrink-0">
            <Bell className="w-[26px] h-[26px] text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Alertas de Sentimento</p>
            <p className="text-3xl font-bold text-foreground tabular-nums leading-none mt-1">{activeAlerts}</p>
            <p className="text-xs text-muted-foreground mt-1">Conversas com sentimento negativo</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 border-l border-border/60 pl-4">
            <TrendText trend={alertsTrend} label="vs. ontem" />
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </DashboardCard>
      </div>

      {/* Grid 3×2 — 6 features */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {AI_FEATURES.map((feature, i) => (
          <DashboardCard key={feature.id} index={i + 3} testid={`ai-feature-${feature.id}`} variant="comfortable"
            className="cursor-pointer" onClick={() => handleFeatureClick(feature)}>
            <div className="flex items-start gap-4">
              <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center shrink-0', FEATURE_TILE[feature.id] ?? 'bg-dash-tile-blue')}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-lg text-foreground leading-tight">{feature.title}</h3>
                  {feature.badge && <Pill label={feature.badge} tone={feature.badge === 'Popular' ? 'info' : 'success'} />}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1.5 leading-snug">{feature.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm font-semibold text-primary-glow">{FEATURE_CTA[feature.id] ?? 'Acessar'} →</span>
                  <div className="w-10 h-10 rounded-full bg-muted/50 border border-border/60 hover:bg-primary/20 hover:border-primary/40 flex items-center justify-center transition-colors">
                    <ArrowRight className="w-[18px] h-[18px] text-foreground" />
                  </div>
                </div>
              </div>
            </div>
          </DashboardCard>
        ))}
      </div>

      {/* Linha final */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        <DashboardCard testid="ai-recent-card" variant="comfortable">
          <SectionHeader icon={Clock} title="Análises Recentes" subtitle="Últimas análises e processamentos de IA" tileSize={44} size="lg"
            right={<VerTodasButton onClick={() => navigate('/sentiment-alerts')} />}
          />
          <div className="rounded-lg bg-muted/20 border border-border/40 px-4 h-10 grid grid-cols-[2fr_1.4fr_1fr_0.8fr_auto] items-center text-xs font-semibold text-muted-foreground">
            <span>Conversa</span><span>Tipo de análise</span><span>Resultado</span><span>Data</span><span className="w-6" />
          </div>
          {recentAnalyses.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-muted-foreground gap-2">
              <Clock className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium text-foreground">Nenhuma análise recente</p>
              <p className="text-xs">As análises aparecerão aqui assim que forem processadas</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentAnalyses.map(a => (
                <div key={a.id} className="grid grid-cols-[2fr_1.4fr_1fr_0.8fr_auto] items-center px-4 py-3 text-[13px]">
                  <span className="truncate text-foreground font-medium">{a.contactName}</span>
                  <span className="text-muted-foreground">Análise de conversa</span>
                  <span><SentimentResult sentiment={a.sentiment} /></span>
                  <span className="text-muted-foreground tabular-nums">{format(new Date(a.createdAt), 'dd/MM HH:mm')}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
        <DashboardCard testid="ai-insights-card" variant="comfortable">
          <SectionHeader icon={Lightbulb} title="Insights de IA" subtitle="Principais insights do período" tileSize={44} size="lg"
            right={<CardSelect value={insightPeriod} onValueChange={(v) => setInsightPeriod(v as InsightPeriod)} options={INSIGHT_PERIODS} testid="ai-insights-period" />}
          />
          {!insights || insights.total === 0 ? (
            <div className="py-10 flex flex-col items-center text-muted-foreground gap-2">
              <Lightbulb className="w-9 h-9 opacity-30" />
              <p className="text-sm font-medium text-foreground">Sem insights ainda</p>
              <p className="text-xs text-center">Os insights aparecem quando há análises suficientes no período</p>
            </div>
          ) : (
            <ul className="space-y-2.5 text-[13px]">
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Análises no período</span>
                <span className="font-semibold text-foreground tabular-nums">{insights.total}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Com sentimento negativo</span>
                <span className={cn('font-semibold tabular-nums', insights.negativePct > 30 ? 'text-dash-red' : 'text-foreground')}>{insights.negativePct}%</span>
              </li>
              {insights.topNegativeDepartment && (
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Fila com mais negativas</span>
                  <span className="font-semibold text-foreground truncate">{insights.topNegativeDepartment}</span>
                </li>
              )}
              {insights.avgSentimentScore !== null && (
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Nota média de sentimento</span>
                  <span className="font-semibold text-foreground tabular-nums">{Math.round(insights.avgSentimentScore)}</span>
                </li>
              )}
            </ul>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
