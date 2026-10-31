/**
 * CV-118 — Label de transparência do copilot.
 *
 * Exibe ao vendedor (e somente ao vendedor) um indicador discreto de que o
 * texto exibido é uma sugestão gerada por IA, nunca enviada automaticamente.
 * Reforça a regra CV-064: sugestão vai para o rascunho, o vendedor decide o envio.
 */
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TransparencyLabelVariant = 'inline' | 'banner' | 'badge';

export interface TransparencyLabelProps {
  variant?: TransparencyLabelVariant;
  /** Texto da fonte, ex: "Copilot RADAR" ou "IA Generativa". */
  sourceLabel?: string;
  /** Se verdadeiro, adiciona nota "não enviado automaticamente". */
  showNotAutoSent?: boolean;
  className?: string;
}

export function TransparencyLabel({
  variant = 'inline',
  sourceLabel = 'Copilot RADAR',
  showNotAutoSent = false,
  className,
}: TransparencyLabelProps) {
  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-3xs font-medium',
          className,
        )}
        title={showNotAutoSent ? 'Sugestão de IA — você decide o envio' : 'Sugerido por IA'}
      >
        <Bot className="w-3 h-3" aria-hidden />
        {sourceLabel}
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        role="note"
        aria-label="Sugestão de inteligência artificial"
        className={cn(
          'flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary/80',
          className,
        )}
      >
        <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>
          Sugestão de <strong>{sourceLabel}</strong>
          {showNotAutoSent && ' — não enviada automaticamente.'}
        </span>
      </div>
    );
  }

  // inline (default)
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-3xs text-muted-foreground', className)}
      title="Sugestão gerada por IA"
    >
      <Bot className="w-2.5 h-2.5" aria-hidden />
      {sourceLabel}
    </span>
  );
}
