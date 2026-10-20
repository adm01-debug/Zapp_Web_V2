import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnecting(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = useCallback(() => {
    setShowReconnecting(true);
    // Check connection by trying to fetch a small resource
    fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
      .then(() => {
        setIsOnline(true);
        setShowReconnecting(false);
      })
      .catch(() => {
        setShowReconnecting(false);
      });
  }, []);

  if (isOnline) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-2 px-4",
          "bg-destructive text-destructive-foreground shadow-lg",
          className
        )}
      >
        {showReconnecting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Reconectando...</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Você está offline</span>
            <button
              onClick={handleRetry}
              className="ml-2 px-2 py-0.5 bg-destructive-foreground/20 hover:bg-destructive-foreground/30 rounded text-xs transition-colors"
            >
              Tentar novamente
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Hook for offline detection
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      if (!isOnline) {
        setWasOffline(true);
        setTimeout(() => setWasOffline(false), 3000);
      }
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  return { isOnline, wasOffline };
}

// Toast notification for connection changes
export function ConnectionToast() {
  const { isOnline, wasOffline } = useOfflineStatus();

  return (
    <AnimatePresence>
      {wasOffline && isOnline && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-success text-success-foreground rounded-full shadow-lg"
        >
          <Wifi className="w-4 h-4" />
          <span className="text-sm font-medium">Conexão restaurada</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
