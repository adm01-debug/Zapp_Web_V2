/**
 * Classificação de status de uma meta a partir do % de progresso.
 * Reaproveita exatamente as faixas de useGoalsDashboard.getProgressColor
 * (>=100 success · >=75 primary · >=50 warning · <50 destructive) — não
 * inventa uma nova régua, só nomeia as 4 faixas que já existem no código.
 */
export type GoalStatusTone = 'success' | 'primary' | 'warning' | 'destructive';

export interface GoalStatus {
  label: string;
  tone: GoalStatusTone;
}

export function getGoalStatus(percentage: number): GoalStatus {
  if (percentage >= 100) return { label: 'Em dia', tone: 'success' };
  if (percentage >= 75) return { label: 'Em andamento', tone: 'primary' };
  if (percentage >= 50) return { label: 'Atenção', tone: 'warning' };
  return { label: 'Em risco', tone: 'destructive' };
}

export const GOAL_STATUS_BADGE_CLASS: Record<GoalStatusTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  primary: 'bg-primary/15 text-primary-glow border-primary/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
};

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABEL[priority] ?? priority;
}

const GOAL_TILE_CLASS: Record<string, string> = {
  'messages-sent': 'bg-dash-tile-blue',
  'contacts-handled': 'bg-dash-tile-green',
  'resolution-rate': 'bg-dash-tile-violet',
};

export function getGoalTileClass(goalId: string): string {
  return GOAL_TILE_CLASS[goalId] ?? 'bg-dash-tile-blue';
}
