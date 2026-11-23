/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { getInitials } from '@/lib/avatar-colors';
import type { Contact } from './types';

/**
 * RD-008 — selo de tipo de contato (ponto + rótulo), reutilizável.
 *
 * O ponto usa o token de cor do tipo (Cliente=--primary, Fornecedor=--violeta,
 * Transportadora=--warning, Colaborador=--success, Prestador=--warning,
 * Parceiro=--destructive). O contraste do texto é garantido pelo par `-text`
 * de cada token (tema claro/escuro), nunca por cor literal.
 *
 * `size="overlay"` é o selo sobre a foto do card (`.zc-type` do design): fundo
 * translúcido escuro fixo — a foto não tem tema claro/escuro, então a leitura
 * precisa ser a mesma nos dois. O `badgeClass` do tipo não entra aqui porque ele
 * é semântico de tema (`dark:`), e sobre a foto o fundo é sempre escuro.
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
  size?: 'sm' | 'md' | 'overlay';
}) {
  const key = type ?? 'cliente';
  const config = CONTACT_TYPE_CONFIG[key] ?? CONTACT_TYPE_CONFIG.cliente;
  const dotColor = config.color;
  const overlay = size === 'overlay';

  return (
    <span
      data-testid="contact-type-badge"
      data-type={key}
      className={cn(
        'inline-flex items-center rounded-md border font-medium leading-none whitespace-nowrap',
        overlay
          ? 'gap-1.5 rounded-[6px] px-2 py-[5px] text-[11px] leading-[1.2] border-[hsl(0_0%_100%/0.16)] bg-[hsl(240_8%_10%/0.86)] text-[hsl(228_20%_96%)] shadow-[0_2px_8px_hsl(0_0%_0%/0.2)]'
          : size === 'sm'
            ? 'gap-1.5 px-1.5 py-0.5 text-[11px]'
            : 'gap-1.5 px-2 py-1 text-xs',
        !overlay && config.badgeClass,
        className,
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn('inline-block rounded-full', overlay ? 'h-[5px] w-[5px]' : 'h-1.5 w-1.5')}
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
