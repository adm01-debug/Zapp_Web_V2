/**
 * CV-067 — AttachmentSuggestion
 *
 * Banner compacto que aparece acima da caixa de digitação quando o RADAR
 * detecta um momento propício para anexar um arquivo existente no sistema.
 *
 * Exibe no máximo 2 sugestões ao mesmo tempo para não poluir a UI.
 * Só sugere arquivos que realmente existem (verificados pelo hook
 * `useAttachmentSuggestion`).
 */
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type { AttachmentSuggestion as AttachmentSuggestionType } from '@/hooks/copilot/useAttachmentSuggestion';

export interface AttachmentSuggestionBannerProps {
  suggestions: AttachmentSuggestionType[];
  /** Chamado quando o vendedor clica "Anexar" — recebe o fileRef do ativo. */
  onAttach: (fileRef: string, label: string) => void;
  /** Chamado quando o vendedor dispensa todas as sugestões. */
  onDismiss: () => void;
  className?: string;
}

export function AttachmentSuggestionBanner({
  suggestions,
  onAttach,
  onDismiss,
  className,
}: AttachmentSuggestionBannerProps) {
  if (suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40',
          'px-3 py-1.5 text-sm',
          className,
        )}
        role="status"
        aria-label="Sugestão de anexo do RADAR"
      >
        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground text-xs mr-1">Anexar?</span>

        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {suggestions.map((s) => (
            <button
              key={s.fileRef}
              type="button"
              onClick={() => onAttach(s.fileRef, s.label)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border/70',
                'px-2.5 py-0.5 text-xs font-medium text-foreground',
                'hover:border-primary/50 hover:bg-primary/5 transition-colors',
              )}
              title={s.description}
            >
              {s.label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="w-5 h-5 rounded-full shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
          onClick={onDismiss}
          aria-label="Dispensar sugestão de anexo"
        >
          <X className="w-3 h-3" />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
