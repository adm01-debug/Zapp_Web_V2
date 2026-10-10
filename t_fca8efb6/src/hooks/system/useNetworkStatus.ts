import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('NetworkStatus');

interface NetworkConnection extends EventTarget {
  readonly effectiveType?: string;
  readonly saveData?: boolean;
}

type NavWithConnection = Navigator & { connection?: NetworkConnection };

const nav = navigator as NavWithConnection;

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  downSince: Date | null;
  effectiveType?: string;
}

/**
 * Hook to monitor network status with connection quality detection.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    wasOffline: false,
    downSince: navigator.onLine ? null : new Date(),
    effectiveType: nav.connection?.effectiveType,
  });

  const handleOnline = useCallback(() => {
    log.info('Network restored');
    setStatus(() => ({
      isOnline: true,
      wasOffline: true,
      downSince: null,
      effectiveType: nav.connection?.effectiveType,
    }));
  }, []);

  const handleOffline = useCallback(() => {
    log.warn('Network lost');
    setStatus((prev) => ({
      ...prev,
      isOnline: false,
      downSince: new Date(),
    }));
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = nav.connection;
    const handleConnectionChange = () => {
      setStatus((prev) => ({
        ...prev,
        effectiveType: connection?.effectiveType,
      }));
    };

    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, [handleOnline, handleOffline]);

  return status;
}
