import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
 * D03 — a dica do controle de volume: o ESTADO ("Volume dos alertas: 70%") e a
 * INSTRUÇÃO ("clique para ajustar"), mais a legenda do ponto azul quando ele aparece.
 * Antes o botão só tinha `title` nativo, e só fora da sidebar: na sidebar o usuário
 * não sabia que o ícone escondia um slider (B3).
 *
 * NÃO exportada de propósito: este arquivo exporta componentes, e exportar uma função
 * daqui quebra o fast refresh (`react-refresh/only-export-components`, lint ratchet).
 */
function textoDaDica(label: string, lowDot: boolean): { estado: string; ponto: string | null } {
  return {
    estado: `${label} — clique para ajustar`,
    ponto: lowDot ? 'Ponto azul: volume baixo ou mudo' : null,
  };
}

/**
 * Botão-gatilho dos controles de volume (ícone + ponto de volume baixo/mudo),
 * compartilhado pelos controles de alertas e de mídias. A interação (clique,
 * clique longo, setas) vem do `rocker`.
 *
 * Na SIDEBAR (sem `title`) o botão traz o próprio Tooltip, com provider local: é o
 * único caminho em que a dica aparece. Fora da sidebar o `title` nativo continua sendo
 * o caminho (o balão de áudio não tem popover nem TooltipProvider garantido).
 */
export const VolumeTriggerButton = forwardRef<HTMLButtonElement, VolumeTriggerButtonProps>(
  function VolumeTriggerButton(
    { label, muted, icon, className, lowDot = false, lowDotTestId, ariaDisabled, title, rocker },
    ref,
  ) {
    const botao = (
      <button
        ref={ref}
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

    if (title) return botao;

    const dica = textoDaDica(label, lowDot);

    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{botao}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="max-w-[230px] text-xs">
            <p>{dica.estado}</p>
            {dica.ponto && <p className="text-3xs text-muted-foreground">{dica.ponto}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
