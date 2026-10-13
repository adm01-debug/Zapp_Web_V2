import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Fallback do balão para mensagem de MÍDIA cuja URL não veio (`image`, `video`, `audio`,
 * `document`, `sticker` sem `mediaUrl`).
 *
 * O defeito: o `MessageBubble` só desenhava o preview DENTRO de `message.mediaUrl &&`, então a
 * linha sem URL caía em nenhum ramo e o balão saía vazio — sem motivo visível para o
 * atendente. Aqui entra um cartão discreto de borda tracejada, com ícone e o motivo
 * ("Mídia indisponível"), no MESMO espírito do `MessageBubbleUnsupported`.
 *
 * Regra de conteúdo: NÃO se inventa URL nem se usa o texto da mensagem como legenda — o cartão
 * só comunica o que falta. Nesta rodada NÃO há ação de tentar de novo (é do MR2); o `action`
 * existe como SLOT para o MR2 plugar a ação depois e, sem ele, não renderiza nada.
 *
 * Visual: só cores/tokens que o sistema já tem (`border-dashed`, `bg-card`/`bg-muted`,
 * `text-muted-foreground`), sem selo de canal/origem. `role="note"` com `aria-label` resumindo
 * o tipo; o ícone é decorativo (`aria-hidden`).
 */
interface MessageBubbleMediaMissingProps {
  /** Nome do tipo de mídia que não chegou (ex.: 'Imagem', 'Vídeo'). Default: 'Mídia'. */
  label?: string;
  isSent: boolean;
  /** Slot do MR2 para a ação de retentativa. Sem valor, nada é renderizado. */
  action?: ReactNode;
  className?: string;
}

export function MessageBubbleMediaMissing({
  label = 'Mídia',
  isSent,
  action,
  className,
}: MessageBubbleMediaMissingProps) {
  const accessible = `${label} indisponível. A mídia desta mensagem não foi recebida.`;

  return (
    <div
      role="note"
      aria-label={accessible}
      data-testid="media-indisponivel"
      data-media-label={label}
      className={cn(
        'motion-safe:transition-colors relative flex items-center gap-2 overflow-hidden rounded-[var(--radius)]',
        'border border-dashed px-3 py-2 text-left',
        isSent
          ? 'border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground'
          : 'border-border bg-card text-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)]',
          isSent ? 'bg-primary-foreground/15' : 'bg-muted',
        )}
      >
        <ImageOff className="h-4 w-4" />
      </span>

      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">Mídia indisponível</p>
        <p className={cn('text-xs', isSent ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {label} não foi recebida.
        </p>
      </div>

      {action}
    </div>
  );
}
