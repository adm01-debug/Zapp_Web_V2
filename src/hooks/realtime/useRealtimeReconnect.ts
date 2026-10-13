import { useEffect, useRef } from 'react';

/**
 * Revalidação após queda de realtime para hooks que assinam `supabase.channel`
 * direto (fora do `useSupabaseRealtime`).
 *
 * Depois de uma queda o canal volta a receber eventos, mas os que passaram
 * durante a queda NÃO são reentregues pelo servidor: quem mostra painel
 * precisa revalidar, senão a tela fica com dados velhos até o próximo evento
 * ou uma recarga manual. Dispara nos mesmos sinais que o RT1 usa — `online` da
 * janela e `visibilitychange` para `visible` — limitando a rajada a uma
 * chamada a cada `REALTIME_RECONNECT_THROTTLE_MS` (a volta da rede costuma
 * emitir os dois sinais quase juntos).
 *
 * O callback é guardado em ref: pode fechar sobre o estado do render atual sem
 * remontar os listeners.
 */
export const REALTIME_RECONNECT_THROTTLE_MS = 5_000;

export function useRealtimeReconnect(onReconnect: () => void, enabled = true) {
  const callbackRef = useRef(onReconnect);

  useEffect(() => {
    callbackRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let lastRunAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      const now = Date.now();
      if (lastRunAt !== null && now - lastRunAt < REALTIME_RECONNECT_THROTTLE_MS) {
        // Rajada: agenda UMA revalidação para o fim da janela, sem empilhar.
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          lastRunAt = Date.now();
          callbackRef.current();
        }, REALTIME_RECONNECT_THROTTLE_MS - (now - lastRunAt));
        return;
      }
      lastRunAt = now;
      callbackRef.current();
    };

    const handleOnline = () => run();
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') run();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [enabled]);
}
