import { forwardRef } from 'react';
import { useSLANotifications } from '@/hooks/sla/useSLANotifications';

export const SLANotificationProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function SLANotificationProvider({ children }, _ref) {
    useSLANotifications();
    return <>{children}</>;
  }
);
