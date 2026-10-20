import { Gamepad2 } from 'lucide-react';
import { useDashboardWidgets, DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import { EnhancedProgressiveDisclosure } from '../ProgressiveDisclosureDashboard';
import { DashboardWidgetRenderer, DashboardStats } from '../DashboardWidgetRenderer';
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
      renderWidget={(widget) => <DashboardWidgetRenderer widget={widget} stats={stats} />}
    />
  );
}
