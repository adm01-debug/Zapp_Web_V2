import { Settings, FileText, Users, Bell, ChevronRight, Trophy, Zap } from 'lucide-react';
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
    <DashboardCard testid="goals-level-card">
      <SectionHeader
        icon={Trophy}
        title="Seu nível e progresso"
        tileSize={34}
        right={onNavigateTab && (
          <button type="button" onClick={() => onNavigateTab('team')} className="text-[11px] font-medium text-primary-glow hover:underline shrink-0">
            Ver ranking →
          </button>
        )}
      />
      <div className="flex items-center gap-2.5">
        <div
          className="w-[38px] h-[38px] bg-primary flex items-center justify-center shrink-0"
          style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
        >
          <span className="text-[14px] font-bold text-white">{stats.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground leading-tight">Nível {stats.level}</p>
          <p className="text-[12px] text-muted-foreground">{stats.xp.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP</p>
        </div>
        <span className="h-[22px] px-2 rounded-md text-[11px] font-semibold bg-primary/15 text-primary-glow flex items-center shrink-0">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden mt-2.5">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
        />
      </div>
      <div className="mt-2.5 rounded-lg bg-primary/10 border border-primary/30 p-2.5 flex items-start gap-2">
        <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">Faltam {missingXp.toLocaleString('pt-BR')} XP para o próximo nível!</p>
          <p className="text-[11px] text-muted-foreground">Continue respondendo e resolvendo conversas para subir de nível.</p>
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
    <DashboardCard testid="goals-quick-actions">
      <SectionHeader icon={Zap} title="Ações rápidas" tileSize={34} />
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={!item.onClick}
            className="w-full h-10 rounded-lg hover:bg-muted/50 flex items-center gap-2.5 px-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-[13px] font-medium text-foreground flex-1 min-w-0 truncate">{item.label}</span>
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
    <DashboardCard testid="goals-motivation-card">
      <div className="flex items-center gap-2.5">
        <div className="w-11 h-11 rounded-[10px] bg-dash-tile-amber flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-white/90" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-foreground">Mensagem do dia</p>
          <p className="text-[12px] text-muted-foreground italic">{phrase}</p>
        </div>
      </div>
    </DashboardCard>
  );
}

export function GoalsRail({ onNavigateTab, onConfigure }: GoalsRailProps) {
  return (
    <div className="space-y-2.5">
      <LevelCard onNavigateTab={onNavigateTab} />
      <QuickActions onNavigateTab={onNavigateTab} onConfigure={onConfigure} />
      <MotivationCard />
    </div>
  );
}
