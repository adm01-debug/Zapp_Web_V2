import { useCallback, useRef } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VolumeSliderPopoverContent } from '@/components/ui/VolumeSliderPopoverContent';
import { VolumeTriggerButton } from '@/components/ui/VolumeTriggerButton';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useVolumeRocker } from '@/hooks/ui/useVolumeRocker';
import {
  SOUND_VOLUME_LABEL,
  SOUND_VOLUME_LABEL_MUTED,
  SOUND_VOLUME_SLIDER_LABEL,
} from '@/lib/volumeLabels';
import { cn } from '@/lib/utils';

/** Passo e faixa do volume dos sons de alerta — espelha o painel (`sound_volume`, 10–100). */
const SOUND_VOLUME_STEP = 5;
const SOUND_VOLUME_MIN = 10;
const SOUND_VOLUME_MAX = 100;
/** Abaixo disso o atendente pode não perceber o alerta; mostramos o ponto de atenção. */
const LOW_VOLUME_THRESHOLD = 30;

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

  const rootRef = useRef<HTMLSpanElement>(null);
  const rocker = useVolumeRocker({
    step: SOUND_VOLUME_STEP,
    onAdjust: adjustBy,
    onToggleMute: toggleMuted,
    rootRef,
  });

  const label = muted ? SOUND_VOLUME_LABEL_MUTED : `${SOUND_VOLUME_LABEL}: ${volume}%`;
  const showLowVolumeDot = muted || volume < LOW_VOLUME_THRESHOLD;
  const Icon = muted ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const trigger = (
    <VolumeTriggerButton
      label={label}
      muted={muted}
      icon={<Icon className="h-[16px] w-[16px]" />}
      className={cn(
        'h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
        !muted && 'text-primary',
      )}
      lowDot={showLowVolumeDot}
      lowDotTestId="sound-volume-low-dot"
      rocker={rocker}
    />
  );

  return (
    <Popover open={rocker.open} onOpenChange={rocker.setOpen}>
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
        <VolumeSliderPopoverContent
          title={SOUND_VOLUME_SLIDER_LABEL}
          valueLabel={muted ? 'Mudo' : `${volume}%`}
          volume={volume}
          muted={muted}
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          step={SOUND_VOLUME_STEP}
          thumbLabel={SOUND_VOLUME_SLIDER_LABEL}
          onVolumeChange={setVolume}
          onToggleMute={toggleMuted}
          valueTestId="sound-volume-value"
        />
      </PopoverContent>
    </Popover>
  );
}
