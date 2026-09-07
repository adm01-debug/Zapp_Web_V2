import { Brain, FileText, Bell, ArrowRight, Cpu, Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { AI_FEATURES, useAIFeatureNavigation } from './aiFeatures';
import { useAIStats } from '@/hooks/analytics/useAIStats';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { DashboardCard, SectionHeader, VerTodasButton } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';

const BADGE_LABEL: Record<string, string> = { Popular: 'Popular', Novo: 'Novo' };

export function AIQuickAccess({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const navigate = useNavigate();
  const handleFeatureClick = useAIFeatureNavigation();
  const { data: aiStats } = useAIStats(30);

  const totalAnalyses = aiStats?.totalAnalyses ?? 0;
  const analysesTrend = aiStats?.trends.analyses;
  const activeAlerts = aiStats?.activeAlerts?.length ?? 0;
  const alertsTrend = aiStats?.trends.negative;

  return (
    <div className="space-y-2.5">
      {/* Linha 1 — 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <DashboardCard testid="ai-model-card" className="flex-row items-center gap-3">
          <div className="w-11 h-11 rounded-[10px] bg-dash-tile-green flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-white/90" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted-foreground">Modelo de IA Ativo</p>
            <p className="text-[16px] font-bold truncate">Gemini 2.5 Flash</p>
            <p className="text-[11px] text-muted-foreground">Alto desempenho comercial</p>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 shrink-0">● Ativo</span>
        </DashboardCard>
        <DashboardKpiCard index={1} label="Análises Disponíveis" value={String(totalAnalyses)}
          delta={analysesTrend && analysesTrend.direction !== 'stable' ? { pct: analysesTrend.percentage * (analysesTrend.direction === 'down' ? -1 : 1) } : null}
          tile="blue" icon={FileText} bars={null} barsColor="blue"
          footer={<span className="text-[11px] text-muted-foreground">Processamentos este mês</span>}
        />
        <DashboardCard testid="ai-alerts-card" className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => onNavigateTab ? onNavigateTab('sentiment') : navigateToView('inbox')}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[10px] bg-dash-tile-amber flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-white/90" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground">Alertas de Sentimento</p>
              <p className="text-[22px] font-bold tabular-nums">{activeAlerts}</p>
              <p className="text-[11px] text-muted-foreground">Conversas com sentimento negativo</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </DashboardCard>
      </div>

      {/* Grid 3×2 — 6 features */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {AI_FEATURES.map((feature, i) => (
          <DashboardCard key={feature.id} index={i + 3} testid={`ai-feature-${feature.id}`}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => handleFeatureClick(feature)}>
            <div className="flex items-start justify-between mb-2">
              <div className={cn('w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0', feature.gradient ?? 'bg-dash-tile-blue')}>
                <feature.icon className="w-5 h-5 text-white/90" />
              </div>
              {feature.badge && (
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                  feature.badge === 'Popular' ? 'bg-primary/15 text-primary-foreground border-primary/30' : 'bg-success/15 text-success border-success/30')}>
                  {feature.badge}
                </span>
              )}
            </div>
            <h3 className="font-bold text-[15px] mb-1">{feature.title}</h3>
            <p className="text-[12.5px] text-muted-foreground line-clamp-2 mb-3">{feature.description}</p>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-[13px] font-semibold text-primary-glow">{feature.action} →</span>
              <div className="w-9 h-9 rounded-full bg-muted/60 hover:bg-primary/20 flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </DashboardCard>
        ))}
      </div>

      {/* Linha final */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        <DashboardCard testid="ai-recent-card">
          <SectionHeader icon={Brain} title="Análises Recentes" subtitle="Últimas análises e processamentos de IA" tileSize={44}
            right={<VerTodasButton onClick={() => navigate('/sentiment-alerts')} />}
          />
          <div className="mt-6 flex flex-col items-center text-muted-foreground gap-2">
            <Brain className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">Nenhuma análise recente disponível</p>
            <p className="text-[12px] opacity-70">As análises aparecerão aqui quando processadas</p>
          </div>
        </DashboardCard>
        <DashboardCard testid="ai-insights-card">
          <SectionHeader icon={Lightbulb} title="Insights de IA" tileSize={34} />
          <div className="mt-6 flex flex-col items-center text-muted-foreground gap-2">
            <Lightbulb className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">Sem insights disponíveis</p>
            <p className="text-[12px] opacity-70">Os insights aparecerão com mais dados de análise</p>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
