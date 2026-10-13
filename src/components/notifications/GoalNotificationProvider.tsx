import { forwardRef } from 'react';
import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';
import { useQueueGoalAlerts } from '@/hooks/business/useQueueGoalAlerts';

export const GoalNotificationProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function GoalNotificationProvider({ children }, _ref) {
    // Initialize goal notifications monitoring
    useGoalNotifications();
    // Aviso global das metas de fila (admin/supervisor): 1 toast por passagem de
    // faixa, fora da tela de Filas. O proprio hook ignora quem nao for staff.
    useQueueGoalAlerts();
    return <>{children}</>;
  }
);
