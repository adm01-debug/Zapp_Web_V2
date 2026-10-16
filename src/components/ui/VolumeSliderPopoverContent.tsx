import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VolumeDial } from '@/components/ui/VolumeDial';
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

/** Transição da troca do estado mudo: só opacidade, curta (item 3 do cartão). */
const TROCA_MUDO = { duration: 0.15, ease: 'easeOut' } as const;

/**
 * Conteúdo do popover de volume (dial circular + − / + / silenciar), compartilhado pelos
 * controles de volume de alertas e de mídias.
 *
 * O dono pediu uma forma CLARA de subir, abaixar e anular o som; agora o painel usa o
 * `VolumeDial` (dial circular, padrão slider-08) no lugar do slider vertical, ficou ~30%
 * menor e mais moderno — 160 px de largura (de 224) e ~180 px de altura (de 259). O número
 * que o dial mostra no centro vem do PRÓPRIO dial (`{value}%` ou "Mudo" animados); o
 * `valueLabel` recebido só alimenta o nó `valueTestId` (contrato do painel). O título fica
 * pequeno em caixa alta e os três controles cabem numa linha compacta de 32 px. O dial é o
 * alvo grande de toque; os três botões pequenos ficam em 32 px (aceite documentada por causa
 * da redução de 30%).
 *
 * O elemento com `role="slider"` é o PRÓPRIO dial, que já publica `aria-valuetext` — o
 * antigo hack de `setAttribute` no thumb do slider deixou de ser necessário.
 *
 * É um `role="dialog"` rotulado, com o foco preso enquanto aberto (S31) e entrada suave
 * (escala 0,96 → 1 + opacidade, ≤200 ms, desligada com movimento reduzido). A marca
 * `data-volume-panel` diz ao `useVolumeRocker` o que é "dentro" do painel: sem ela, o
 * clique no próprio dial contaria como clique fora e fecharia tudo.
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
  const reduzirMovimento = useReducedMotion() ?? false;
  const passo = step > 0 ? step : 5;
  // A troca do estado mudo (ícone + rótulo) entra com um fade curto; com movimento reduzido
  // nada aparece animado (a troca é instantânea).
  const entradaMudo = reduzirMovimento ? false : { opacity: 0 };
  const estadoMudo = muted ? 'mudo' : 'som';

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
    <motion.div
      ref={painelRef}
      {...{ [VOLUME_PANEL_ATTRIBUTE]: '' }}
      role="dialog"
      aria-label={title}
      onKeyDown={prenderFoco}
      initial={reduzirMovimento ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex flex-col items-center gap-1"
    >
      <span className="text-3xs font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground">
        {title}
      </span>

      <VolumeDial
        value={volume}
        min={min}
        max={max}
        step={passo}
        disabled={disabled}
        muted={muted}
        onChange={onVolumeChange}
        ariaLabel={thumbLabel}
      />

      {/* O número visível vive no centro do dial; este nó mantém o contrato de `valueTestId`
          do painel e anuncia a mudança de valor a quem usa leitor de tela. */}
      <span data-testid={valueTestId} aria-live="polite" className="sr-only">
        {valueLabel}
      </span>

      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={`Diminuir ${title} em ${passo}%`}
          onClick={() => ajustar(-passo)}
          disabled={disabled}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant={muted ? 'default' : 'outline'}
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={muted ? unmuteLabel : muteLabel}
          aria-pressed={muted}
          onClick={onToggleMute}
          disabled={disabled}
        >
          <motion.span
            key={estadoMudo}
            data-testid="volume-mute-icon"
            className="inline-flex"
            initial={entradaMudo}
            animate={{ opacity: 1 }}
            transition={TROCA_MUDO}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </motion.span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={`Aumentar ${title} em ${passo}%`}
          onClick={() => ajustar(passo)}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Estado visível do mudo (o nome acessível já está no botão + aria-pressed). */}
      <motion.span
        key={estadoMudo}
        data-testid="volume-mute-label"
        aria-hidden="true"
        className="text-3xs leading-none text-muted-foreground"
        initial={entradaMudo}
        animate={{ opacity: 1 }}
        transition={TROCA_MUDO}
      >
        {muted ? unmuteLabel : muteLabel}
      </motion.span>

      {footer}
    </motion.div>
  );
}
