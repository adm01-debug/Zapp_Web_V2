import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, HeadphoneOff, Headphones, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaVolume } from '@/hooks/communication/useMediaVolume';
import { MEDIA_VOLUME_STEP } from '@/lib/mediaVolumeStore';
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
const LONG_PRESS_MS = 400;

// Textos distintos dos do botão de alertas (E29): "Silenciar sons de alerta" já existe e
// continua sendo só dos alertas.
export const MEDIA_VOLUME_LABEL = 'Volume dos áudios e vídeos';
export const MEDIA_VOLUME_LABEL_MUTED = 'Áudios e vídeos mudos';
const SLIDER_LABEL = 'Volume das mídias';

/**
 * E13 — controle único de volume das mídias de conversa (áudio/vídeo das mensagens).
 *
 * Clique curto no ícone = mudo/desmudo; clique longo (ou o chevron) abre o slider;
 * scroll sobre o ícone anda de 5 em 5 (E15). Setas ↑/↓ e `M` funcionam com o ícone
 * focado — e nunca a partir do campo de mensagem (E16).
 */
export function MediaVolumeControl({
  variant = 'bubble',
  className,
  disabled = false,
  disabledReason,
}: MediaVolumeControlProps) {
  const { volume, muted, setVolume, toggleMuted, isSupported } = useMediaVolume();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

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

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  // E15 — scroll sobre o ícone ajusta ±5. Listener nativo porque o `onWheel` do React é
  // registrado como passivo e não consegue impedir a página de rolar junto.
  useEffect(() => {
    const element = rootRef.current;
    if (!element || sliderDisabled) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      adjustBy(event.deltaY < 0 ? MEDIA_VOLUME_STEP : -MEDIA_VOLUME_STEP);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [adjustBy, sliderDisabled]);

  const handleTriggerClick = () => {
    if (disabled) return;
    if (longPressFiredRef.current) {
      // O clique longo já abriu o slider: o click que vem no dedup/pointerup não muta.
      longPressFiredRef.current = false;
      return;
    }
    toggleMuted();
  };

  const handlePointerDown = () => {
    if (disabled) return;
    longPressFiredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // E16 — não sequestrar as setas quando o foco está num campo de texto.
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustBy(MEDIA_VOLUME_STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustBy(-MEDIA_VOLUME_STEP);
    } else if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      toggleMuted();
    }
  };

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
    <button
      type="button"
      onClick={handleTriggerClick}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onKeyDown={handleTriggerKeyDown}
      aria-label={label}
      aria-pressed={muted}
      aria-disabled={disabled}
      // Fora da sidebar o padrão da casa é `title` nativo (é o que a velocidade e a
      // transcrição do balão usam) — o Radix Tooltip exige TooltipProvider e o balão
      // precisa funcionar fora do shell do app.
      title={isSidebar ? undefined : label}
      className={cn(
        'relative inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        variant === 'bubble' && 'h-6 w-6 rounded-md hover:bg-foreground/10',
        variant === 'overlay' && 'h-9 w-9 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80',
        variant === 'sidebar' && 'h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && isSidebar && !muted && 'text-primary',
      )}
    >
      <Icon className={isSidebar ? 'h-[16px] w-[16px]' : 'h-[14px] w-[14px]'} />
      {showLowVolumeDot && (
        <span
          data-testid="media-volume-low-dot"
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
                setOpen((current) => !current);
              }}
              aria-label="Ajustar volume das mídias"
              aria-expanded={open}
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
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-3xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Volume
            </span>
            <span className="text-xs font-semibold tabular-nums" data-testid="media-volume-value">
              {muted ? 'Mudo' : `${volume}%`}
            </span>
          </div>

          <div className="flex h-28 items-center justify-center">
            <Slider
              orientation="vertical"
              min={0}
              max={100}
              step={MEDIA_VOLUME_STEP}
              value={[volume]}
              onValueChange={(values) => {
                if (values.length > 0) setVolume(values[0]);
              }}
              disabled={sliderDisabled}
              thumbLabel={SLIDER_LABEL}
              className="h-28"
            />
          </div>

          <Button
            type="button"
            variant={muted ? 'default' : 'outline'}
            size="sm"
            className="h-7 w-full text-xs"
            onClick={toggleMuted}
            aria-pressed={muted}
            disabled={disabled}
          >
            {muted ? 'Ativar som' : 'Mudo'}
          </Button>

          {!isSupported && (
            <p className="text-3xs leading-snug text-muted-foreground">
              Este navegador deixa o volume por conta do sistema (iOS). Ajuste pelo volume do aparelho.
            </p>
          )}
          {disabled && disabledReason && (
            <p className="text-3xs leading-snug text-muted-foreground">{disabledReason}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
