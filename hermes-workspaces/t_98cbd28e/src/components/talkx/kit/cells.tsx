import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TileColor } from './constants';
import { IconTile } from './primitives';
import { fmtInt, fmtPct, fmtRelativeDay } from './format';

/* ------------------------------------------------------------------ */
/* Células padrão de tabela (X043)                                    */
/* ------------------------------------------------------------------ */

/** Cor da barra de progresso por status da campanha. */
const PROGRESS_COLOR: Record<string, string> = {
  draft: 'bg-muted-foreground/40',
  scheduled: 'bg-dash-violet',
  sending: 'bg-primary',
  paused: 'bg-dash-amber',
  completed: 'bg-success',
  cancelled: 'bg-destructive',
};

/**
 * Miniatura do item: usa `mediaUrl` quando é imagem acessível e cai no tile
 * do ícone (fallback) quando não há mídia ou a imagem falha ao carregar.
 */
export function EntityCell({
  name, description, mediaUrl, mediaType, icon = Megaphone, color = 'blue', className,
}: {
  name: string; description?: string;
  mediaUrl?: string | null; mediaType?: string | null;
  icon?: LucideIcon; color?: TileColor; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const isImage = !!mediaUrl && /^https?:\/\//i.test(mediaUrl) && (mediaType == null || mediaType === 'image') && !failed;
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      {isImage ? (
        <img
          src={mediaUrl as string}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-border/60"
        />
      ) : (
        <IconTile icon={icon} color={color} size={40} glow />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
        {description && <p className="text-2xs text-foreground-secondary truncate">{description}</p>}
      </div>
    </div>
  );
}

/**
 * Progresso da campanha: rascunho mostra "—" com barra vazia; os demais mostram
 * o percentual e a barra na cor do status (agendada começa em "0%").
 */
export function ProgressCell({ status, value, className }: {
  status: string; value?: number | null; className?: string;
}) {
  const isDraft = status === 'draft';
  const percent = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const barColor = PROGRESS_COLOR[status] ?? 'bg-primary';
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <div className="flex-1 h-1.5 min-w-[64px] rounded-full bg-muted/60 overflow-hidden">
        {!isDraft && percent > 0 && (
          <div className={cn('h-full rounded-full', barColor)} style={{ width: `${percent}%` }} />
        )}
      </div>
      <span className="text-2xs font-medium tabular-nums text-foreground-secondary w-9 text-right">
        {isDraft ? '—' : `${percent}%`}
      </span>
    </div>
  );
}

/**
 * Resultados da campanha: "N enviados" e, com base de envio, "M entregues (x,x%)".
 * O total de falhas vai no `title` (não ocupa linha).
 */
export function ResultsCell({ sent, delivered = 0, failed = 0, className }: {
  sent: number; delivered?: number; failed?: number; className?: string;
}) {
  if (!sent) return <span className="text-xs text-muted-foreground">—</span>;
  const title = failed > 0 ? `${fmtInt(failed)} ${failed === 1 ? 'falha' : 'falhas'}` : undefined;
  return (
    <div className={cn('min-w-0', className)} title={title}>
      <p className="text-xs font-medium text-foreground tabular-nums">{fmtInt(sent)} enviados</p>
      <p className="text-2xs text-foreground-secondary tabular-nums">
        {fmtInt(delivered)} entregues ({fmtPct(delivered, sent)})
      </p>
    </div>
  );
}

/** Canal da campanha: logo do WhatsApp em SVG inline (sem importar imagem). */
export function ChannelCell({ size = 18, label = 'WhatsApp', className }: {
  size?: number; label?: string; className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center justify-center text-whatsapp', className)} title={label}>
      <svg
        role="img"
        aria-label={label}
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </span>
  );
}

/**
 * Data agendada/executada em formato relativo ("Hoje, 10:00" / "Ontem, 16:20" /
 * "15 set, 09:30") com o criador opcional na segunda linha.
 */
export function DateByCell({ date, by, className }: {
  date?: string | null; by?: string | null; className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-xs text-foreground tabular-nums">{fmtRelativeDay(date)}</p>
      {by && <p className="text-2xs text-foreground-secondary truncate">por {by}</p>}
    </div>
  );
}
