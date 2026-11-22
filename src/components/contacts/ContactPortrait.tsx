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
 */
export function ContactPortrait({ contact, className }: { contact: Contact; className?: string }) {
  const display = toContactDisplay(contact);
  const initials = getInitials(display.nomeCompleto ?? contact.name);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const fallbackBg = isDark ? 'hsl(var(--contacts-raised))' : 'hsl(220 20% 92%)';
  const fallbackFg = isDark ? 'hsl(var(--contacts-ink))' : 'hsl(var(--contacts-quiet))';

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ background: fallbackBg }}>
      {contact.avatar_url ? (
        <img
          src={contact.avatar_url}
          alt={display.nomeCompleto ?? contact.name}
          draggable={false}
          loading="lazy"
          className="h-full w-full object-cover object-[50%_31%]"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-display"
          style={{ color: fallbackFg, fontSize: 'clamp(2rem, 8cqw, 3rem)' }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
