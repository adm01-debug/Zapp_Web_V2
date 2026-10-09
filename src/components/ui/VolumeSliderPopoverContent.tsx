import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { VOLUME_PANEL_ATTRIBUTE } from '@/hooks/ui/useVolumeRocker';

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

/** Tudo que recebe foco no painel — usado para prender o foco enquanto ele está aberto. */
const FOCAVEIS =
  'button:not([disabled]), [role="slider"], [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Conteúdo do popover de volume (valor grande, slider vertical, − / +, silenciar),
 * compartilhado pelos controles de volume de alertas e de mídias.
 *
 * O dono pediu uma forma CLARA de subir, abaixar e anular o som: o painel passou a
 * mostrar o valor grande, ganhou os botões − e + (5%, alvos de 44 px para o toque) e
 * um botão grande de silenciar com o estado visível — antes só havia o slider.
 *
 * É um `role="dialog"` rotulado, com o foco preso enquanto aberto (S31). A marca
 * `data-volume-panel` diz ao `useVolumeRocker` o que é "dentro" do painel: sem ela, o
 * clique no próprio slider contaria como clique fora e fecharia tudo.
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
  muteLabel = 'Silenciar',
  unmuteLabel = 'Ativar som',
  disabled = false,
  footer,
  valueTestId,
}: VolumeSliderPopoverContentProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const passo = step > 0 ? step : 5;
  const valorFalado = muted ? 'Mudo' : `${volume} por cento`;

  // O `Slider` do projeto não repassa props aos thumbs (o `role="slider"` é do thumb), e
  // `aria-valuetext` no Root não chegaria ao leitor de tela. Sem tocar no componente
  // compartilhado (`src/components/ui/slider.tsx`, de outro cartão), o texto falado é
  // aplicado no thumb já renderizado e refeito a cada mudança de valor.
  useEffect(() => {
    painelRef.current?.querySelector('[role="slider"]')?.setAttribute('aria-valuetext', valorFalado);
  }, [valorFalado, disabled]);

  const ajustar = (delta: number) => {
    const proximo = Math.min(max, Math.max(min, volume + delta));
    if (proximo !== volume) onVolumeChange(proximo);
  };

  /** Foco preso: Tab no último alvo volta ao primeiro (e Shift+Tab no primeiro vai ao último). */
  const prenderFoco = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const alvos = Array.from(painelRef.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
    if (alvos.length === 0) return;
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    const ativo = document.activeElement;
    const fora = !painelRef.current?.contains(ativo);
    if (event.shiftKey && (ativo === primeiro || fora)) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && ativo === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div
      ref={painelRef}
      {...{ [VOLUME_PANEL_ATTRIBUTE]: '' }}
      role="dialog"
      aria-label={title}
      onKeyDown={prenderFoco}
      className="flex flex-col items-center gap-3"
    >
      <span className="text-3xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </span>

      <span className="text-3xl font-semibold leading-none tabular-nums" data-testid={valueTestId} aria-live="polite">
        {valueLabel}
      </span>

      <div className="flex h-28 items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={`Diminuir ${title} em ${passo}%`}
          onClick={() => ajustar(-passo)}
          disabled={disabled}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Slider
          orientation="vertical"
          min={min}
          max={max}
          step={passo}
          value={[volume]}
          onValueChange={(values) => {
            if (values.length > 0) onVolumeChange(values[0]);
          }}
          disabled={disabled}
          thumbLabel={thumbLabel}
          className="h-28"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={`Aumentar ${title} em ${passo}%`}
          onClick={() => ajustar(passo)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        variant={muted ? 'default' : 'outline'}
        className="h-11 w-full text-sm"
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
