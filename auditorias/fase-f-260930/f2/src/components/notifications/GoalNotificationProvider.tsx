import { forwardRef } from 'react';
import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';

export const GoalNotificationProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function GoalNotificationProvider({ children }, _ref) {
    // Initialize goal notifications monitoring
    useGoalNotifications();
    return <>{children}</>;
  }
);
