import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeReconnectingNotice } from '@/hooks/realtime/realtimeStatusStore';

/**
 * Selo discreto do cabeçalho da lista de conversas: aparece só quando o canal
 * Realtime fica sem conexão por mais de 5 s (ver `realtimeStatusStore`) e some
 * sozinho assim que a conexão volta. `role="status"` faz o leitor de tela
 * anunciar a mudança; a pulsação é `motion-safe` (some com reduzir movimento,
 * que o CSS global também respeita). Cores só as do sistema (`border-border`,
 * `bg-muted`, `text-muted-foreground`).
 */
export function RealtimeStatusBadge({ className }: { className?: string }) {
  const reconnecting = useRealtimeReconnectingNotice();

  if (!reconnecting) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="realtime-status-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground',
        className,
      )}
    >
      <WifiOff className="h-3 w-3 motion-safe:animate-pulse" aria-hidden="true" />
      Reconectando…
    </span>
  );
}
