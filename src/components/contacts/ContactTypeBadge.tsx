/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { getInitials } from '@/lib/avatar-colors';
import type { Contact } from './types';

/**
 * RD-008 —? selo de tipo de contato (ponto + rótulo), reutilizável.
 *
 * O ponto usa o token de cor do tipo (Cliente=--primary, Fornecedor=--violeta,
 * Transportadora=--warning, Colaborador=--success, Prestador=--warning,
 * Parceiro=--destructive). O contraste do texto é garantido pelo par `-text`
 * de cada token (tema claro/escuro), nunca por cor literal.
 */
export function ContactTypeBadge({
  type,
  className,
  showDot = true,
  size = 'md',
}: {
  type: string | null | undefined;
  className?: string;
  showDot?: boolean;
  size?: 'sm' | 'md';
}) {
  const key = type ?? 'cliente';
  const config = CONTACT_TYPE_CONFIG[key] ?? CONTACT_TYPE_CONFIG.cliente;
  const dotColor = config.color;

  return (
    <span
      data-testid="contact-type-badge"
      data-type={key}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium leading-none whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        config.badgeClass,
        className,
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {config.label}
    </span>
  );
}

export function getTypeDotColor(type: string | null | undefined): string {
  const key = type ?? 'cliente';
  return (CONTACT_TYPE_CONFIG[key] ?? CONTACT_TYPE_CONFIG.cliente).color;
}

export function getTypeInitials(contact: Contact): string {
  return getInitials(contact.name);
}
