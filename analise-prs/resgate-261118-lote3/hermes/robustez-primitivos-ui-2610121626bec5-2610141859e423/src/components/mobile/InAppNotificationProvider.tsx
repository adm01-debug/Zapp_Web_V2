import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { InAppNotification, InAppNotificationData } from './InAppNotification';

interface InAppNotificationContextType {
  showNotification: (data: Omit<InAppNotificationData, 'id'>) => void;
}

const InAppNotificationContext = createContext<InAppNotificationContextType>({
  showNotification: () => {},
});

export function useInAppNotification() {
  return useContext(InAppNotificationContext);
}

export function InAppNotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<InAppNotificationData | null>(null);

  const showNotification = useCallback((data: Omit<InAppNotificationData, 'id'>) => {
    setNotification({ ...data, id: crypto.randomUUID() });
  }, []);

  const handleDismiss = useCallback(() => setNotification(null), []);

  return (
    <InAppNotificationContext.Provider value={{ showNotification }}>
      {children}
      <InAppNotification notification={notification} onDismiss={handleDismiss} />
    </InAppNotificationContext.Provider>
  );
}
