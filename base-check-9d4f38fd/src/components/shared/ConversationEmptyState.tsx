import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Estado vazio único dos módulos de conversa (Inbox, Chat da Equipe, Email).
 *
 * Padrão decidido (cartão t_fced78b2): ícone lucide de 28px num selo de 64px
 * (`rounded-2xl` sobre `bg-primary/10`), título de 18px e UMA frase; a ação
 * primária do módulo entra por `action` quando existir. Sem atalhos de teclado
 * e sem animação — nada de movimento contínuo, então a guarda de reduzir
 * movimento do CSS global não tem o que segurar aqui.
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
  return (
    <div
      data-testid="conversation-empty-state"
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center',
        className,
      )}
    >
      <div className="max-w-md">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/10">
          <Icon aria-hidden="true" className="h-7 w-7 text-primary/70" />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
