import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

export interface VolumeSliderPopoverContentProps {
  title: string;
  /** Rótulo do valor, ex.: "70%" ou "Mudo". */
  valueLabel: string;
  volume: number;
  muted: boolean;
  min: number;
  max: number;
  step: number;
  thumbLabel: string;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  muteLabel?: string;
  unmuteLabel?: string;
  disabled?: boolean;
  /** Texto extra (ex.: aviso de navegador sem suporte a volume). */
  footer?: ReactNode;
  valueTestId?: string;
}

/**
 * Conteúdo do popover de volume (slider vertical + valor + botão mudo/desmudo),
 * compartilhado pelos controles de volume de alertas e de mídias.
 */
export function VolumeSliderPopoverContent({
  title,
  valueLabel,
  volume,
  muted,
  min,
  max,
  step,
  thumbLabel,
  onVolumeChange,
  onToggleMute,
  muteLabel = 'Mudo',
  unmuteLabel = 'Ativar som',
  disabled = false,
  footer,
  valueTestId,
}: VolumeSliderPopoverContentProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-3xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </span>
        <span className="text-xs font-semibold tabular-nums" data-testid={valueTestId}>
          {valueLabel}
        </span>
      </div>

      <div className="flex h-28 items-center justify-center">
        <Slider
          orientation="vertical"
          min={min}
          max={max}
          step={step}
          value={[volume]}
          onValueChange={(values) => {
            if (values.length > 0) onVolumeChange(values[0]);
          }}
          disabled={disabled}
          thumbLabel={thumbLabel}
          className="h-28"
        />
      </div>

      <Button
        type="button"
        variant={muted ? 'default' : 'outline'}
        size="sm"
        className="h-7 w-full text-xs"
        onClick={onToggleMute}
        aria-pressed={muted}
        disabled={disabled}
      >
        {muted ? unmuteLabel : muteLabel}
      </Button>

      {footer}
    </div>
  );
}
