import { forwardRef } from 'react';
import { useRealtimeSentimentAlerts } from '@/hooks/inbox/useRealtimeSentimentAlerts';

export const RealtimeSentimentAlertProvider = forwardRef<HTMLDivElement>(
  function RealtimeSentimentAlertProvider(_props, _ref) {
    // This hook sets up the realtime subscription
    useRealtimeSentimentAlerts();
    
    // This component doesn't render anything visible
    return null;
  }
);
