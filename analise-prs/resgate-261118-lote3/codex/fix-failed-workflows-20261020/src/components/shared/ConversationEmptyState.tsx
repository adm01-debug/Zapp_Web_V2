import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Estado vazio único dos módulos de conversa (Inbox, Chat da Equipe, Email).
 *
 * Padrão decidido (cartão t_fced78b2): ícone lucide de 28px num selo de 64px
 * (`rounded-2xl` sobre `bg-primary/10`), título de 18px e UMA frase; a ação
 * primária do módulo entra por `action` quando existir. A entrada e os pequenos
 * sinais visuais respeitam `prefers-reduced-motion`; a preferência não deixa o
 * conteúdo invisível nem desliga o estado vazio.
 */
export interface ConversationEmptyStateProps {
  /** Ícone do módulo (lucide-react). */
  icon: LucideIcon;
  /** Título curto, em caixa de frase. */
  title: string;
  /** Uma frase explicando o que fazer. */
  description: string;
  /** Ação primária opcional do módulo (ex.: "Nova conversa"). */
  action?: ReactNode;
  /** Classes extras do contêiner (ex.: fundo do módulo). */
  className?: string;
}

export function ConversationEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: ConversationEmptyStateProps) {
  const reduzido = useReducedMotion() ?? false;

  return (
    <motion.div
      data-testid="conversation-empty-state"
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center',
        className,
      )}
      initial={reduzido ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="max-w-md">
        <motion.div
          className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center"
          aria-hidden="true"
          animate={reduzido ? undefined : { rotate: 360 }}
          transition={reduzido ? undefined : { duration: 18, repeat: Infinity, ease: 'linear' }}
        >
          <motion.div
            className="absolute h-16 w-16 rounded-2xl bg-primary/10 ring-1 ring-primary/10"
            animate={reduzido ? undefined : { scale: [1, 1.08, 1] }}
            transition={reduzido ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative"
            initial={reduzido ? false : { opacity: 0 }}
            animate={reduzido ? undefined : { opacity: 1 }}
            transition={reduzido ? undefined : { duration: 0.35 }}
          >
            <Icon className="h-7 w-7 text-primary/70" />
          </motion.div>
          <motion.span
            className="absolute left-1 top-5 h-2 w-2 rounded-full bg-primary/50"
            initial={reduzido ? false : { opacity: 0 }}
            animate={reduzido ? undefined : { opacity: [0.2, 1, 0.2] }}
            transition={reduzido ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute right-1 bottom-5 h-2 w-2 rounded-full bg-primary/40"
            initial={reduzido ? false : { opacity: 0 }}
            animate={reduzido ? undefined : { opacity: [0.2, 1, 0.2] }}
            transition={reduzido ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
          />
        </motion.div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </motion.div>
  );
}
