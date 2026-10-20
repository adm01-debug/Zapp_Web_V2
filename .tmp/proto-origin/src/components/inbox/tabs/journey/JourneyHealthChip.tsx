/**
 * JourneyHealthChip (fase K, etapa K05) — a faixa de saúde do relacionamento.
 *
 * Chip do TOPO do bloco de estatísticas da aba Journey: diz, em um olhar, há quanto tempo o
 * contato não fala com a gente e o que isso significa (Ativo / Morno / Esfriando / Inativo).
 *
 * Componente de APRESENTAÇÃO: não consulta banco, não guarda estado e não conhece a régua —
 * quem classifica é `src/lib/journey/health.ts` (função pura). A dica (`title`) explica a régua
 * e quantas interações houve nos últimos 30 dias.
 *
 * Cores: só os tokens do sistema (`success`/`info`/`warning`/`muted`), o mesmo par que o
 * `PILL_CLASS` da aba já usa. Efeito: só o `FadeSlideIn` do pacote `motion/` (J05), que já
 * respeita `prefers-reduced-motion`.
 */
import type { LucideIcon } from 'lucide-react';
import { Clock, HeartPulse, Moon, Snowflake } from 'lucide-react';
import { classifyJourneyHealth, HEALTH_RECENT_WINDOW_DAYS } from '@/lib/journey/health';
import type { JourneyHealthInput, JourneyHealthLevel, JourneyHealthTone } from '@/lib/journey/health';
import { FadeSlideIn } from './motion';
import { cn } from '@/lib/utils';

/** Ícone por faixa: o desenho acompanha o tom (coração batendo = Ativo; lua = Inativo). */
const ICONS: Record<JourneyHealthLevel, LucideIcon> = {
  active: HeartPulse,
  warm: Clock,
  cooling: Snowflake,
  inactive: Moon,
};

/** Tom -> classes de token (as mesmas combinações do resto da aba). */
const TONE_CLASS: Record<JourneyHealthTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  info: 'bg-info/15 text-info border-info/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

export interface JourneyHealthChipProps extends Pick<JourneyHealthInput, 'lastInteractionAt' | 'recentInteractions'> {
  /** Relógio de referência; por padrão, agora. */
  now?: Date;
  className?: string;
}

export function JourneyHealthChip({
  lastInteractionAt = null,
  recentInteractions = null,
  now,
  className,
}: JourneyHealthChipProps) {
  const health = classifyJourneyHealth({ lastInteractionAt, recentInteractions }, now);
  const Icon = ICONS[health.level];
  const frequencia =
    health.recentCount === 1
      ? `1 interação nos últimos ${HEALTH_RECENT_WINDOW_DAYS} dias`
      : `${health.recentCount} interações nos últimos ${HEALTH_RECENT_WINDOW_DAYS} dias`;
  const dica = `${health.headline}. ${frequencia}. ${health.rule}`;

  return (
    <FadeSlideIn index={0} className="w-fit max-w-full">
      <div
        data-testid="journey-health-chip"
        data-level={health.level}
        role="group"
        aria-label={`Saúde do relacionamento: ${dica}`}
        title={dica}
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1',
          'text-2xs font-semibold break-words',
          TONE_CLASS[health.tone],
          className,
        )}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>{health.headline}</span>
      </div>
    </FadeSlideIn>
  );
}
