import type { ReactNode } from 'react';
import type { VolumeRocker } from '@/hooks/ui/useVolumeRocker';
import { cn } from '@/lib/utils';

export interface VolumeTriggerButtonProps {
  label: string;
  muted: boolean;
  icon: ReactNode;
  /** Classes de variante/tamanho (bubble/overlay/sidebar). */
  className?: string;
  lowDot?: boolean;
  lowDotTestId?: string;
  ariaDisabled?: boolean;
  /** `title` nativo (usado fora da sidebar, onde não há TooltipProvider). */
  title?: string;
  rocker: VolumeRocker;
}

/**
 * Botão-gatilho dos controles de volume (ícone + ponto de volume baixo/mudo),
 * compartilhado pelos controles de alertas e de mídias. A interação (clique,
 * clique longo, setas) vem do `rocker`.
 */
export function VolumeTriggerButton({
  label,
  muted,
  icon,
  className,
  lowDot = false,
  lowDotTestId,
  ariaDisabled,
  title,
  rocker,
}: VolumeTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={rocker.handleTriggerClick}
      onPointerDown={rocker.handlePointerDown}
      onPointerUp={rocker.clearLongPress}
      onPointerLeave={rocker.clearLongPress}
      onPointerCancel={rocker.clearLongPress}
      onKeyDown={rocker.handleTriggerKeyDown}
      aria-label={label}
      aria-pressed={muted}
      aria-haspopup="dialog"
      aria-expanded={rocker.open}
      aria-disabled={ariaDisabled}
      title={title}
      className={cn(
        'relative inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      {icon}
      {lowDot && (
        <span
          data-testid={lowDotTestId}
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </button>
  );
}
