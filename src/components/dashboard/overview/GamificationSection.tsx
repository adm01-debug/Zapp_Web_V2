import { Gamepad2 } from 'lucide-react';
import { useDashboardWidgets, DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import { EnhancedProgressiveDisclosure } from '../ProgressiveDisclosureDashboard';
import { DashboardWidgetRenderer, DashboardStats } from '../DashboardWidgetRenderer';
import { AchievementsSystem } from '@/components/gamification/AchievementsSystem';
import type { WidgetSection } from '../DashboardSectionHeader';

interface GamificationSectionProps {
  stats: DashboardStats;
  /** false esconde o widget de Ranking (dado da equipe inteira, não é pessoal). */
  isStaff?: boolean;
}

/**
 * Preserva Desafios, Ranking, Conquistas, Mini-games e IA Stats (widgets
 * level 2 "challenges" + level 3 inteiros) numa única seção colapsada —
 * fora da referência visual, mas nada é removido, só reorganizado (etapa 81).
 *
 * O widget "Conquistas" renderizava o painel de DEMONSTRAÇÃO (DemoAchievements),
 * que depende de um GamificationProvider que o dashboard não monta — os botões
 * ("Resposta < 30s", "Streak 5", …) não faziam nada. Aqui ele passa a renderizar
 * o painel REAL (AchievementsSystem), que lê agent_stats/agent_achievements da
 * conta autenticada. Demonstração e controles sem efeito não aparecem mais.
 */
export function GamificationSection({ stats, isStaff = true }: GamificationSectionProps) {
  const { visibleWidgets } = useDashboardWidgets();
  const combined: DashboardWidget[] = visibleWidgets
    .filter((w) => w.type === 'challenges' || w.level === 3)
    .filter((w) => isStaff || w.type !== 'leaderboard')
    .sort((a, b) => a.order - b.order);

  const sections: WidgetSection[] = [
    {
      id: 'gamification',
      title: 'Gamificação & IA Stats',
      description: 'Desafios, ranking, conquistas, mini-games e estatísticas de IA',
      icon: Gamepad2,
      widgets: combined,
      defaultOpen: false,
      variant: 'secondary',
    },
  ];

  return (
    <EnhancedProgressiveDisclosure
      sections={sections}
      renderWidget={(widget) =>
        widget.type === 'achievements'
          ? <AchievementsSystem showCompact />
          : <DashboardWidgetRenderer widget={widget} stats={stats} />
      }
    />
  );
}
