import { forwardRef } from 'react';
import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';
import { useQueueGoalAlerts } from '@/hooks/analytics/useQueueGoalAlerts';

export const GoalNotificationProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function GoalNotificationProvider({ children }, _ref) {
    // Initialize goal notifications monitoring
    useGoalNotifications();
    // Avisos de limite das metas de FILA (contatos aguardando, espera, pendentes e taxa de
    // atribuição) — a montagem única aqui é o que evita aviso repetido por tela.
    useQueueGoalAlerts();
    return <>{children}</>;
  }
);
