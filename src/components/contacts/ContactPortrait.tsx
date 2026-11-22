import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/avatar-colors';
import { toContactDisplay } from './contactDisplay';
import type { Contact } from './types';

/**
 * RD-006 — retrato do contato (foto ou iniciais).
 *
 * Regras de proteção de tela (dado pessoal): `draggable={false}`, sem menu
 * "salvar imagem" e, na ausência de foto, iniciais sobre fundo neutro (nunca um
 * background público do contato). A cor do fallback usa os tokens `--contacts-*`
 * (claro/escuro) — zero cor literal.
 *
 * Design (`.zc-portrait` / `.zc-fallback`): a foto entra em `object-position 50% 31%`
 * e ganha `scale(1.035)` quando o botão do retrato é hover; o fallback é o
 * monograma grande (75px, `letter-spacing:-3px`) sobre um gradiente radial.
 * O zoom depende de `group/photo` no botão que envolve este componente.
 */
export function ContactPortrait({
  contact,
  className,
  initialsClassName = 'text-[75px] tracking-[-3px]',
  priority = false,
}: {
  contact: Contact;
  className?: string;
  initialsClassName?: string;
  /** ZD-101 — só a primeira linha carrega a foto junto do HTML; o resto entra lazy. */
  priority?: boolean;
}) {
  const display = toContactDisplay(contact);
  const initials = getInitials(display.nomeCompleto ?? contact.name);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const fallbackBg = isDark
    ? 'radial-gradient(ellipse at 30% 20%, hsl(230 5% 29%) 0%, hsl(var(--contacts-line)) 48%, hsl(var(--contacts-page)) 100%)'
    : 'radial-gradient(ellipse at 30% 20%, hsl(220 18% 88%) 0%, hsl(var(--contacts-raised)) 48%, hsl(var(--contacts-page)) 100%)';
  const fallbackFg = isDark ? 'hsl(var(--contacts-ink))' : 'hsl(var(--contacts-quiet))';

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ background: fallbackBg }}>
      {contact.avatar_url ? (
        <img
          src={contact.avatar_url}
          alt={display.nomeCompleto ?? contact.name}
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="h-full w-full object-cover object-[50%_31%] transition-transform duration-[550ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover/photo:scale-[1.035] motion-reduce:transform-none motion-reduce:transition-none"
        />
      ) : (
        <div
          className={cn('grid h-full w-full place-items-center font-display font-medium', initialsClassName)}
          style={{ color: fallbackFg }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
