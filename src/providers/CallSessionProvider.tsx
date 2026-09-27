/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
import { useSipClient } from '@/hooks/communication/useSipClient';

type CallSession = ReturnType<typeof useSipClient>;

const CallSessionContext = createContext<CallSession | undefined>(undefined);

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const session = useSipClient();
  return (
    <CallSessionContext.Provider value={session}>
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession(): CallSession {
  const ctx = useContext(CallSessionContext);
  if (!ctx) throw new Error('useCallSession deve ser usado dentro de CallSessionProvider');
  return ctx;
}
