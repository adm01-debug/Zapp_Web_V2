import { Settings, FileText, Users, Bell, ChevronRight, Trophy, Zap, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { DashboardCard, SectionHeader } from '../overview/DashboardCard';
import { useAgentGamification, levelProgress, xpForNextLevel } from '@/hooks/gamification/useAgentGamification';
import { MOTIVATION_PHRASES, dayOfYear } from '../overview/motivationPhrases';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

interface GoalsRailProps {
  onNavigateTab?: (tab: string) => void;
  onConfigure: () => void;
}

function LevelCard({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const { stats } = useAgentGamification();
  const reducedMotion = useReducedMotion();

  if (!stats) return null;

  const progress = levelProgress(stats.xp, stats.level);
  const nextLevelXp = xpForNextLevel(stats.level);
  const missingXp = Math.max(nextLevelXp - stats.xp, 0);

  return (
    <DashboardCard testid="goals-level-card" variant="comfortable">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[18px] font-bold text-foreground tracking-[-0.01em]">Seu nível e progresso</p>
        {onNavigateTab && (
          <button type="button" onClick={() => onNavigateTab('team')} className="text-[13px] font-semibold text-primary-glow hover:underline shrink-0 flex items-center gap-1">
            Ver ranking →
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 bg-primary flex items-center justify-center shrink-0"
          style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
        >
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-bold text-foreground leading-tight">Nível {stats.level}</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">{stats.xp.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP</p>
        </div>
        <span className="h-9 px-3.5 rounded-full text-[16px] font-bold bg-primary/15 text-primary-glow flex items-center shrink-0">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden mt-4">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
        />
      </div>
      <div className="mt-4 rounded-xl bg-primary/10 border border-primary/25 p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-dash-tile-blue flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary-glow">Faltam {missingXp.toLocaleString('pt-BR')} XP para o próximo nível!</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Continue batendo suas metas e evolua mais rápido.</p>
        </div>
      </div>
    </DashboardCard>
  );
}

function QuickActions({ onNavigateTab, onConfigure }: GoalsRailProps) {
  const items = [
    { icon: Settings, label: 'Configurar Metas', onClick: onConfigure },
    { icon: FileText, label: 'Ver Relatório de Metas', onClick: onNavigateTab ? () => onNavigateTab('reports') : undefined },
    { icon: Users, label: 'Metas da Equipe', onClick: onNavigateTab ? () => onNavigateTab('team') : undefined },
    { icon: Bell, label: 'Preferências de Notificações', onClick: () => navigateToView('settings') },
  ];

  return (
    <DashboardCard testid="goals-quick-actions" variant="comfortable">
      <p className="text-[18px] font-bold text-foreground tracking-[-0.01em] mb-4">Ações rápidas</p>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={!item.onClick}
            className="w-full h-11 rounded-lg border border-border/60 bg-input/30 hover:bg-muted/50 hover:border-primary/40 flex items-center gap-3 px-3 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <item.icon className="w-[18px] h-[18px] text-primary-glow shrink-0" />
            <span className="text-[14px] font-medium text-foreground flex-1 min-w-0 truncate">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </DashboardCard>
  );
}

function MotivationCard() {
  const phrase = MOTIVATION_PHRASES[dayOfYear(new Date()) % MOTIVATION_PHRASES.length];
  return (
    <DashboardCard testid="goals-motivation-card" variant="comfortable">
      <div className="flex items-center gap-4">
        <Trophy className="w-12 h-12 text-dash-amber shrink-0" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-foreground leading-tight">
            Disciplina hoje, <span className="text-primary-glow">resultados amanhã!</span>
          </p>
          <p className="text-[13px] text-muted-foreground mt-1 italic">“{phrase}”</p>
          <div className="flex gap-1.5 mt-3">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

export function GoalsRail({ onNavigateTab, onConfigure }: GoalsRailProps) {
  return (
    <div className="space-y-4">
      <LevelCard onNavigateTab={onNavigateTab} />
      <QuickActions onNavigateTab={onNavigateTab} onConfigure={onConfigure} />
      <MotivationCard />
    </div>
  );
}
