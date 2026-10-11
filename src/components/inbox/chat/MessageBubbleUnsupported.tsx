import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Eye, Contact, FileQuestion, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { zappMotion, zappTransition } from '@/lib/motion';
import type { UnsupportedMessageKind } from '@/types/chat';

/**
 * Fallback do balão para mensagens que o Zapp Web V2 não renderiza (contrato em
 * `src/types/chat.ts`, classificado por `classifyMessageType`/`normalizeMessage`).
 *
 * O balão não pode ficar vazio: sem ramo para `type === 'unsupported'` o `MessageBubble`
 * simplesmente não desenhava nada. Aqui entra um cartão de borda tracejada com o motivo
 * legível — nunca o conteúdo cru do tipo (enquete, visualização única e contato só fazem
 * sentido no celular), e nenhuma ação falsa: a única saída é o texto "Abra no celular".
 *
 * Acessibilidade: `role="note"` com `aria-label` resumindo o tipo (e o conteúdo, quando o
 * adaptador o preservou); o ícone é decorativo. O movimento usa os tokens de `src/lib/motion`
 * e é desligado por `useReducedMotion` (nada desloca, só opacidade/cor).
 */

interface UnsupportedCopy {
  Icon: LucideIcon;
  /** Texto visível — o que o leitor de tela lê e o que o usuário vê. */
  text: string;
}

const COPY: Record<UnsupportedMessageKind, UnsupportedCopy> = {
  poll: { Icon: BarChart3, text: 'Enquete. Abra no celular para ver as opções.' },
  view_once: { Icon: Eye, text: 'Mensagem de visualização única. Abra no celular.' },
  contact: { Icon: Contact, text: 'Contato compartilhado. Abra no celular.' },
  other: { Icon: FileQuestion, text: 'Tipo de mensagem não suportado nesta tela.' },
};

interface MessageBubbleUnsupportedProps {
  kind: UnsupportedMessageKind;
  /** Conteúdo preservado pelo adaptador, quando existe (nunca dado sensível do tipo). */
  content?: string;
  className?: string;
}

export function MessageBubbleUnsupported({
  kind,
  content,
  className,
}: MessageBubbleUnsupportedProps) {
  const reduceMotion = useReducedMotion();
  const { Icon, text } = COPY[kind] ?? COPY.other;
  const accessible = content ? `${text} Conteúdo: ${content}` : text;

  return (
    <motion.div
      role="note"
      aria-label={accessible}
      data-testid="message-unsupported"
      data-unsupported-kind={kind}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
      animate={{ opacity: 1, y: 0 }}
      transition={zappTransition.normal}
      className={cn(
        'group/unsupported motion-safe:transition-shadow relative overflow-hidden',
        'rounded-[var(--radius)] border border-dashed border-border bg-card px-3 py-2',
        'text-left',
        className,
      )}
    >
      {/* Brilho diagonal discreto, só no hover e só com movimento permitido. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-accent/10 to-transparent',
          'opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:group-hover/unsupported:opacity-100',
        )}
      />

      <div className="relative flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center',
            'rounded-[var(--radius)] bg-accent/10 text-accent',
          )}
        >
          <Icon className={cn('h-5 w-5', !reduceMotion && 'motion-safe:animate-pulse')} />
        </span>

        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{text}</p>
          {content && (
            <p className="text-xs italic break-words text-muted-foreground">{content}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
