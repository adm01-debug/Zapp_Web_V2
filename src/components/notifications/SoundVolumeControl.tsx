import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { cn } from '@/lib/utils';

/** Passo e faixa do volume dos sons de alerta — espelha o painel (`sound_volume`, 10–100). */
const SOUND_VOLUME_STEP = 5;
const SOUND_VOLUME_MIN = 10;
const SOUND_VOLUME_MAX = 100;
/** Abaixo disso o atendente pode não perceber o alerta; mostramos o ponto de atenção. */
const LOW_VOLUME_THRESHOLD = 30;
const LONG_PRESS_MS = 400;

const clampVolume = (value: number) =>
  Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, Math.round(value)));

/**
 * Controle rápido do volume dos **sons de alerta** na sidebar.
 *
 * Substitui o antigo `SoundMuteToggle`, que só mutava e não permitia subir/abaixar o
 * volume. Agora o usuário sobe e desce o volume dos alertas:
 *  - clique = mudo/desmudo (mantido, como no controle de mídias ao lado);
 *  - clique longo = abre o slider vertical (gráfico de aumentar/diminuir);
 *  - scroll sobre o ícone e setas ↑/↓ ajustam de 5 em 5;
 *  - a tecla `M` alterna o mudo.
 *
 * Volume e mudo saem SEMPRE das preferências (`useNotificationSettings`), nunca de
 * constantes. O ícone reflete o nível: `Volume1` (baixo) → `Volume2` (alto), ou
 * `VolumeX` quando mudo.
 */
export function SoundVolumeControl({ className }: { className?: string }) {
  const { settings, updateSettings } = useNotificationSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const muted = !settings.soundEnabled;
  const volume = settings.soundVolume;

  const setVolume = useCallback(
    (value: number) => {
      void updateSettings({ soundVolume: clampVolume(value) });
    },
    [updateSettings],
  );
  const adjustBy = useCallback(
    (delta: number) => {
      void updateSettings({ soundVolume: clampVolume(volume + delta) });
    },
    [updateSettings, volume],
  );
  const toggleMuted = useCallback(() => {
    void updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [updateSettings, settings.soundEnabled]);

  const label = muted ? 'Sons de alerta mudos' : `Volume dos alertas: ${volume}%`;
  const showLowVolumeDot = muted || volume < LOW_VOLUME_THRESHOLD;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  // Scroll sobre o ícone ajusta ±5. Listener nativo porque o `onWheel` do React é
  // registrado como passivo e não consegue impedir a página de rolar junto.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      adjustBy(event.deltaY < 0 ? SOUND_VOLUME_STEP : -SOUND_VOLUME_STEP);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [adjustBy]);

  const handleTriggerClick = () => {
    if (longPressFiredRef.current) {
      // O clique longo já abriu o slider: o click do pointerup não muta.
      longPressFiredRef.current = false;
      return;
    }
    toggleMuted();
  };

  const handlePointerDown = () => {
    longPressFiredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Não sequestrar as setas quando o foco está num campo de texto.
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
      adjustBy(SOUND_VOLUME_STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustBy(-SOUND_VOLUME_STEP);
    } else if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      toggleMuted();
    }
  };

  const Icon = muted ? VolumeX : volume < 50 ? Volume1 : Volume2;

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
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        !muted && 'text-primary',
      )}
    >
      <Icon className="h-[16px] w-[16px]" />
      {showLowVolumeDot && (
        <span
          data-testid="sound-volume-low-dot"
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          ref={rootRef}
          className={cn('relative inline-flex items-center', className)}
          onClick={(event) => event.stopPropagation()}
        >
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
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
              Volume dos alertas
            </span>
            <span className="text-xs font-semibold tabular-nums" data-testid="sound-volume-value">
              {muted ? 'Mudo' : `${volume}%`}
            </span>
          </div>

          <div className="flex h-28 items-center justify-center">
            <Slider
              orientation="vertical"
              min={SOUND_VOLUME_MIN}
              max={SOUND_VOLUME_MAX}
              step={SOUND_VOLUME_STEP}
              value={[volume]}
              onValueChange={(values) => {
                if (values.length > 0) setVolume(values[0]);
              }}
              thumbLabel="Volume dos alertas"
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
          >
            {muted ? 'Ativar som' : 'Mudo'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
