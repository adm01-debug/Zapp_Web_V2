import { motion, useReducedMotion } from 'framer-motion';
import { Contact, Eye, FileQuestion } from 'lucide-react';
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
 * Glifo PRÓPRIO por tipo, com movimento próprio (barras que oscilam de leve na enquete,
 * olho com anel que se expande na visualização única, cartão de visita que respira no
 * contato). O movimento usa SÓ transform/opacity e os tokens de `src/lib/motion`. Com
 * `useReducedMotion` ligado nada oscila nem se desloca: o glifo fica parado (opacidade/cor
 * continuam mudando no hover e no foco). `data-anim`/`data-anim-active` expõem o estado do
 * movimento para o teste, sem depender do nome de uma utilidade de animação.
 *
 * Acessibilidade: `role="note"` com `aria-label` resumindo o tipo (e o conteúdo, quando o
 * adaptador o preservou); os glifos animados são decorativos (`aria-hidden`).
 */

type GlyphKind = 'poll-bars' | 'view-once-ring' | 'contact-card' | 'static';

const COPY: Record<UnsupportedMessageKind, string> = {
  poll: 'Enquete. Abra no celular para ver as opções.',
  view_once: 'Mensagem de visualização única. Abra no celular.',
  contact: 'Contato compartilhado. Abra no celular.',
  other: 'Tipo de mensagem não suportado nesta tela.',
};

/** Glifo de cada tipo. `other` (e linha antiga sem `unsupportedKind`) é estático. */
const GLYPH: Record<UnsupportedMessageKind, GlyphKind> = {
  poll: 'poll-bars',
  view_once: 'view-once-ring',
  contact: 'contact-card',
  other: 'static',
};

interface GlyphProps {
  kind: GlyphKind;
  reduceMotion: boolean;
}

/** Desenha o glifo do tipo com o movimento próprio dele (ou parado, se reduzido). */
function Glyph({ kind, reduceMotion }: GlyphProps) {
  if (kind === 'poll-bars') {
    // Enquete: três barras que oscilam de leve, cada uma com um pequeno atraso.
    return (
      <span
        data-anim="poll-bars"
        data-anim-active={reduceMotion ? 'false' : 'true'}
        aria-hidden="true"
        className="flex h-6 items-end gap-[3px]"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 rounded-[2px] bg-accent"
            style={{ height: 8 + i * 4, transformOrigin: 'bottom' }}
            initial={{ scaleY: 0.6 }}
            animate={reduceMotion ? { scaleY: 1 } : { scaleY: [0.55, 1, 0.65] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: 1.1,
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                    delay: i * 0.05,
                  }
            }
          />
        ))}
      </span>
    );
  }

  if (kind === 'view-once-ring') {
    // Visualização única: olho com um anel que se expande e some.
    return (
      <span
        data-anim="view-once-ring"
        data-anim-active={reduceMotion ? 'false' : 'true'}
        aria-hidden="true"
        className="relative flex h-6 w-6 items-center justify-center"
      >
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full border border-accent"
          initial={{ scale: 0.8, opacity: 0.5 }}
          animate={reduceMotion ? { scale: 1, opacity: 0.45 } : { scale: [0.8, 1.15], opacity: [0.6, 0] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }
          }
        />
        <Eye aria-hidden="true" className="relative h-5 w-5 text-accent" />
      </span>
    );
  }

  if (kind === 'contact-card') {
    // Contato: cartão de visita que respira (só escala).
    return (
      <motion.span
        data-anim="contact-card"
        data-anim-active={reduceMotion ? 'false' : 'true'}
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center"
        initial={{ scale: 1 }}
        animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.08, 1] }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
        }
      >
        <Contact className="h-5 w-5 text-accent" />
      </motion.span>
    );
  }

  return (
    <span
      data-anim="static"
      data-anim-active="false"
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center"
    >
      <FileQuestion className="h-5 w-5 text-accent" />
    </span>
  );
}

interface MessageBubbleUnsupportedProps {
  kind: UnsupportedMessageKind;
  /** Conteúdo preservado pelo adaptador, quando existe (nunca dado sensível do tipo). */
  content?: string;
  className?: string;
}

export function MessageBubbleUnsupported({ kind, content, className }: MessageBubbleUnsupportedProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const text = COPY[kind] ?? COPY.other;
  const glyph = GLYPH[kind] ?? 'static';
  const accessible = content ? `${text} Conteúdo: ${content}` : text;

  return (
    <motion.div
      role="note"
      aria-label={accessible}
      data-testid="message-unsupported"
      data-unsupported-kind={kind}
      data-motion={reduceMotion ? 'reduced' : 'full'}
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
        data-testid="unsupported-glow"
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-accent/10 to-transparent',
          'opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:group-hover/unsupported:opacity-100',
        )}
      />

      <div className="relative flex items-start gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent/10">
          <Glyph kind={glyph} reduceMotion={reduceMotion} />
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
