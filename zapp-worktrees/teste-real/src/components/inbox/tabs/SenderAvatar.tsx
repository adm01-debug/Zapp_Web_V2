import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

export type SenderAvatarSize = 'sm' | 'md';

export interface SenderAvatarProps {
  /** Nome de quem enviou — é o mesmo texto do `title`/`aria-label`. */
  name: string;
  /** Foto redonda do remetente; sem ela (ou com a imagem quebrada) saem as iniciais. */
  avatarUrl?: string | null;
  /** Chave estável da pessoa (id do perfil/contato) — mesma chave, mesma cor. */
  colorKey?: string;
  /** sm = 20 px, md = 28 px (as duas medidas do mockup). */
  size?: SenderAvatarSize;
  /** Selo do canal no canto inferior direito da foto (D05). */
  channelBadge?: 'whatsapp' | null;
  /** Mostra o nome ao lado, em uma linha com reticências (D03). */
  showName?: boolean;
}

/** sm = 20 px (`w-5`/`h-5`), md = 28 px (`w-7`/`h-7`) — Tailwind spacing de 4 px. */
const SIZES = {
  sm: { circle: 'w-5 h-5', px: 20, initials: 'text-3xs', badge: 'w-2.5 h-2.5', badgeIcon: 'w-1.5 h-1.5' },
  md: { circle: 'w-7 h-7', px: 28, initials: 'text-2xs', badge: 'w-3 h-3', badgeIcon: 'w-2 h-2' },
} as const;

/**
 * Foto de quem enviou o arquivo (D02/D03/D05), para a linha do remetente do cartão.
 * Não anima nada de propósito: nada pisca ao recarregar a mesma foto (a `<img>` não é
 * remontada nem troca de `key`) e não há movimento para reduzir sob `prefers-reduced-motion`.
 */
export function SenderAvatar({
  name,
  avatarUrl = null,
  colorKey,
  size = 'sm',
  channelBadge = null,
  showName = false,
}: SenderAvatarProps) {
  // Guarda a URL que falhou (e não um simples booleano): a mesma foto quebrada não é
  // tentada de novo, mas uma foto nova depois do erro é mostrada.
  const [urlQuebrada, setUrlQuebrada] = useState<string | null>(null);
  const medida = SIZES[size];
  const foto = avatarUrl && avatarUrl !== urlQuebrada ? avatarUrl : null;
  const cor = getAvatarColor(colorKey || name);
  const iniciais = getInitials(name) || '?';

  return (
    <span
      role="img"
      title={`Enviado por ${name}`}
      aria-label={`Enviado por ${name}`}
      data-testid="sender-avatar"
      className="inline-flex min-w-0 items-center gap-1.5"
    >
      <span
        data-testid="sender-avatar-circle"
        className={cn('relative shrink-0 rounded-full', medida.circle)}
      >
        {foto ? (
          <img
            data-testid="sender-avatar-photo"
            src={foto}
            alt=""
            loading="lazy"
            decoding="async"
            width={medida.px}
            height={medida.px}
            className="h-full w-full rounded-full object-cover"
            onError={() => setUrlQuebrada(foto)}
          />
        ) : (
          <span
            data-testid="sender-avatar-initials"
            aria-hidden="true"
            className={cn(
              'flex h-full w-full select-none items-center justify-center rounded-full font-semibold uppercase',
              cor.bg,
              cor.text,
              medida.initials,
            )}
          >
            {iniciais}
          </span>
        )}

        {channelBadge === 'whatsapp' && (
          <span
            data-testid="sender-avatar-channel-badge"
            className={cn(
              'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-card ring-1 ring-border',
              medida.badge,
            )}
          >
            {/* Cor via `text-whatsapp-dark` (--whatsapp-dark): 3,73:1 no claro e 6,48:1 no escuro. */}
            <MessageCircle aria-hidden="true" className={cn('text-whatsapp-dark', medida.badgeIcon)} />
          </span>
        )}
      </span>

      {showName && (
        <span data-testid="sender-avatar-name" className="min-w-0 truncate text-xs text-muted-foreground">
          {name}
        </span>
      )}
    </span>
  );
}
