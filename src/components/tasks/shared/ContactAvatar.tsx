import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

const SIZES = {
  sm: 'h-[18px] w-[18px] text-3xs',
  md: 'h-6 w-6 text-2xs',
  lg: 'h-10 w-10 text-xs',
} as const;

interface Props {
  name?: string | null;
  /** Foto do contato, quando o chamador tiver (`item.contact.avatar_url`). */
  avatarUrl?: string | null;
  /** `sm` (18px, igual ao card), `md` (24px) ou `lg` (40px, painel). */
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Etapa 069 — avatar do contato do módulo de Tarefas: FOTO quando existe,
 * senão a inicial sobre a cor determinística de `getAvatarColor`.
 *
 * A imagem é decorativa (`alt=""`) e o nome acessível fica no contêiner
 * (`role="img"` + `aria-label`), para o leitor de tela anunciar o contato uma
 * vez só — e não "imagem, imagem".
 */
export function ContactAvatar({ name, avatarUrl, size = 'sm', className = '' }: Props) {
  const nome = (name ?? '').trim();
  const nomeAcessivel = nome || 'Contato';
  const caixa = `${SIZES[size]} shrink-0 items-center justify-center rounded-full overflow-hidden`;

  if (avatarUrl) {
    return (
      <span
        role="img"
        aria-label={nomeAcessivel}
        title={nome || undefined}
        data-testid="contact-avatar"
        className={`inline-flex ${caixa} ${className}`}
      >
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  const { bg, text } = getAvatarColor(nome || '?');
  return (
    <span
      role="img"
      aria-label={nomeAcessivel}
      title={nome || undefined}
      data-testid="contact-avatar"
      className={`inline-flex ${caixa} font-bold ${bg} ${text} ${className}`}
    >
      {getInitials(nome || '?')}
    </span>
  );
}
