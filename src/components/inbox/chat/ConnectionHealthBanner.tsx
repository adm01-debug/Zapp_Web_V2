import { AlertTriangle, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { connectionBannerText, type ConnectionBanner } from '@/hooks/inbox/useConnectionHealthBanner';

interface Props {
  banner: ConnectionBanner;
  /** Admin vê a instrução de gerar o QR; os demais, "avise o admin" (QR é só admin — regras.md §4.2). */
  isAdmin: boolean;
  className?: string;
}

/** Aviso amarelo (nível 0) ou vermelho (nível 1+) acima da caixa de mensagem. */
export function ConnectionHealthBanner({ banner, isAdmin, className }: Props) {
  const texto = connectionBannerText(banner, isAdmin);
  if (!texto) return null;
  const down = banner.level === 'down';
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-health-banner"
      data-level={banner.level}
      className={cn(
        'mb-2 flex items-center gap-2 rounded-lg border border-border border-l-4 px-3 py-2 text-sm',
        down
          ? 'border-l-destructive bg-destructive/10 text-[hsl(var(--destructive-text))]'
          : 'border-l-warning bg-warning/10 text-[hsl(var(--warning-text))]',
        className,
      )}
    >
      {down
        ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span>{texto}</span>
    </div>
  );
}
