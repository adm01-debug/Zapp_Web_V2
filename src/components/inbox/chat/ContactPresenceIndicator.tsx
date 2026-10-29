import { cn } from '@/lib/utils';
import {
  describeContactPresence,
  type ContactPresenceFields,
} from './contactPresence';

interface ContactPresenceIndicatorProps {
  contact: ContactPresenceFields | null | undefined;
  /** No painel do contato não existe linha de presença hoje: sem sinal, não
   *  desenha nada (mantém o estado neutro atual). No cabeçalho, o ponto neutro
   *  nomeado para o leitor de tela continua aparecendo. */
  hideWhenUnknown?: boolean;
  className?: string;
}

/**
 * Indicador de presença real do contato. Mesma fonte e mesmo limiar no
 * cabeçalho do chat e no painel do contato (ver ./contactPresence).
 */
export function ContactPresenceIndicator({ contact, hideWhenUnknown = false, className }: ContactPresenceIndicatorProps) {
  const signal = describeContactPresence(contact);

  if (signal.kind === 'unknown') {
    if (hideWhenUnknown) return null;
    return (
      <span
        data-testid="contact-presence"
        role="img"
        aria-label={signal.label}
        title={signal.label}
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
      />
    );
  }

  return (
    <span data-testid="contact-presence" className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          signal.kind === 'online' ? 'bg-success' : 'bg-muted-foreground/50',
        )}
      />
      <span className="truncate">{signal.label}</span>
    </span>
  );
}
