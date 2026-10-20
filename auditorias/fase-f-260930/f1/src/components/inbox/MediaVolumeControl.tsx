import { useCallback, useRef } from 'react';
import { ChevronUp, HeadphoneOff, Headphones, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VolumeSliderPopoverContent } from '@/components/ui/VolumeSliderPopoverContent';
import { VolumeTriggerButton } from '@/components/ui/VolumeTriggerButton';
import { useMediaVolume } from '@/hooks/communication/useMediaVolume';
import { useVolumeRocker } from '@/hooks/ui/useVolumeRocker';
import { MEDIA_VOLUME_STEP } from '@/lib/mediaVolumeStore';
import {
  MEDIA_VOLUME_LABEL,
  MEDIA_VOLUME_LABEL_MUTED,
  MEDIA_VOLUME_SLIDER_LABEL,
} from '@/lib/volumeLabels';
import { cn } from '@/lib/utils';

export type MediaVolumeControlVariant = 'bubble' | 'overlay' | 'sidebar';

export interface MediaVolumeControlProps {
  variant?: MediaVolumeControlVariant;
  className?: string;
  /** E26 — vídeo sem faixa de áudio: controle visível, porém inerte, com a razão no tooltip. */
  disabled?: boolean;
  disabledReason?: string;
}

/** Abaixo disso o atendente não descobre sozinho por que "não escuta o áudio do cliente" (E30). */
const LOW_VOLUME_THRESHOLD = 30;

// Rótulos vêm de `@/lib/volumeLabels` (fonte única também usada pelo E2E; E29 — distintos
// dos do botão de alertas).

/**
 * E13 — controle único de volume das mídias de conversa (áudio/vídeo das mensagens).
 *
 * Clique curto no ícone = mudo/desmudo; clique longo (ou o chevron) abre o slider;
 * scroll sobre o ícone anda de 5 em 5 (E15). Setas ↑/↓ e `M` funcionam com o ícone
 * focado — e nunca a partir do campo de mensagem (E16). A lógica de interação vive
 * em `useVolumeRocker` (compartilhada com o controle de alertas).
 */
export function MediaVolumeControl({
  variant = 'bubble',
  className,
  disabled = false,
  disabledReason,
}: MediaVolumeControlProps) {
  const { volume, muted, setVolume, toggleMuted, isSupported } = useMediaVolume();

  const isSidebar = variant === 'sidebar';
  const showChevron = !isSidebar;
  // Sem caminho para aplicar o volume (nem `element.volume`, nem AudioContext) o slider
  // aparece desabilitado com explicação, em vez de mentir para o usuário (D5/E09).
  const sliderDisabled = disabled || !isSupported;
  const label = disabled && disabledReason ? disabledReason : muted ? MEDIA_VOLUME_LABEL_MUTED : MEDIA_VOLUME_LABEL;
  const showLowVolumeDot = isSidebar && !disabled && (muted || volume < LOW_VOLUME_THRESHOLD);

  const adjustBy = useCallback(
    (delta: number) => {
      setVolume(volume + delta);
    },
    [setVolume, volume],
  );

  const rootRef = useRef<HTMLSpanElement>(null);
  const rocker = useVolumeRocker({
    step: MEDIA_VOLUME_STEP,
    onAdjust: adjustBy,
    onToggleMute: toggleMuted,
    rootRef,
    enabled: !disabled,
    wheelEnabled: !sliderDisabled,
  });

  const Icon = isSidebar
    ? muted
      ? HeadphoneOff
      : Headphones
    : muted || volume === 0
      ? VolumeX
      : volume < 50
        ? Volume1
        : Volume2;

  const trigger = (
    <VolumeTriggerButton
      label={label}
      muted={muted}
      icon={<Icon className={isSidebar ? 'h-[16px] w-[16px]' : 'h-[14px] w-[14px]'} />}
      className={cn(
        variant === 'bubble' && 'h-6 w-6 rounded-md hover:bg-foreground/10',
        variant === 'overlay' && 'h-9 w-9 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80',
        variant === 'sidebar' && 'h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && isSidebar && !muted && 'text-primary',
      )}
      lowDot={showLowVolumeDot}
      lowDotTestId="media-volume-low-dot"
      ariaDisabled={disabled}
      title={isSidebar ? undefined : label}
      rocker={rocker}
    />
  );

  return (
    <Popover open={rocker.open} onOpenChange={rocker.setOpen}>
      <PopoverAnchor asChild>
        {/* stopPropagation: no fullscreen, o backdrop fecha no clique — e o popover do
            Radix é um portal React, então o clique do slider também subiria até lá. */}
        <span
          ref={rootRef}
          className={cn('relative inline-flex items-center', !isSidebar && 'gap-0.5', className)}
          onClick={(event) => event.stopPropagation()}
        >
          {isSidebar ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            trigger
          )}

          {showChevron && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                // Abre mesmo quando inerte: é aqui que mora a explicação do E26
                // ("Vídeo sem áudio") — um controle que não explica o próprio silêncio
                // é pior do que não existir.
                rocker.setOpen((current) => !current);
              }}
              aria-label="Ajustar volume das mídias"
              aria-expanded={rocker.open}
              className={cn(
                'inline-flex items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                variant === 'bubble' && 'h-4 w-4 hover:bg-foreground/10',
                variant === 'overlay' && 'h-6 w-6 bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
          )}
        </span>
      </PopoverAnchor>

      <PopoverContent
        side="right"
        align="center"
        collisionPadding={8}
        className="z-[60] w-56 p-3 motion-reduce:animate-none"
        onClick={(event) => event.stopPropagation()}
      >
        <VolumeSliderPopoverContent
          title="Volume"
          valueLabel={muted ? 'Mudo' : `${volume}%`}
          volume={volume}
          muted={muted}
          min={0}
          max={100}
          step={MEDIA_VOLUME_STEP}
          thumbLabel={MEDIA_VOLUME_SLIDER_LABEL}
          onVolumeChange={setVolume}
          onToggleMute={toggleMuted}
          disabled={sliderDisabled}
          valueTestId="media-volume-value"
          footer={
            <>
              {!isSupported && (
                <p className="text-3xs leading-snug text-muted-foreground">
                  Este navegador deixa o volume por conta do sistema (iOS). Ajuste pelo volume do aparelho.
                </p>
              )}
              {disabled && disabledReason && (
                <p className="text-3xs leading-snug text-muted-foreground">{disabledReason}</p>
              )}
            </>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
