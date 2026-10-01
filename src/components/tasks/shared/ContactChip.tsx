import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

interface Props {
  contactName: string;
  /** Foto do contato, quando o chamador tiver (`item.contact.avatar_url`). */
  avatarUrl?: string | null;
  onClick?: () => void;
}

/**
 * Etapa 32: chip do contato no card. Avatar de 18px — foto quando existe,
 * senão a inicial sobre a cor determinística de `getAvatarColor`. O clique abre
 * a conversa no inbox (prop `onClick`; `WorkItemCard` só passa `onOpenContact`).
 */
export function ContactChip({ contactName, avatarUrl, onClick }: Props) {
  const colors = getAvatarColor(contactName || '?');
  const initials = getInitials(contactName);
  return (
    <button
      type="button"
      data-testid="contact-chip"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-2xs font-medium text-primary hover:bg-primary/20 transition-colors max-w-[140px] truncate"
      title={`Abrir ${contactName}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${colors.bg} ${colors.text}`}>
          {initials}
        </span>
      )}
      <span className="truncate">{contactName}</span>
    </button>
  );
}
