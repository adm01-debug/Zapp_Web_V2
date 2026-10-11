/**
 * `SlidingSegmented` — segmentado cujo indicador desliza entre as opções.
 *
 * Acessível como botões de opção (não são abas: escolher aqui troca o filtro, o
 * conteúdo é o mesmo): `role="radiogroup"` + `role="radio"`/`aria-checked`, com
 * setas ←/→ movendo a escolha e o foco. Só a opção marcada entra na ordem do
 * Tab (`tabIndex` 0) — quem usa teclado não atravessa todas as opções.
 *
 * O indicador (fundo na cor do token) é um só elemento com `layoutId`: ele
 * desliza com a mola `snappy` em vez de piscar. Com `prefers-reduced-motion:
 * reduce` ele aparece direto na opção, sem deslizar — vira um `<span>` estático,
 * sem `layoutId` (a escolha continua visível).
 *
 * Cor do indicador: só os tons com par de texto do sistema (`*-foreground`) —
 * `info`, `primary`, `success`, `warning`, `destructive`. O `whatsapp` não tem
 * texto-sobre-cor definido em `tokens.css`, então fica fora do indicador (o
 * rótulo escolhido pinta com `text-<tom>-foreground`, garantindo o contraste).
 */
import type { KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { zappSpring } from '@/lib/motion';
import { toneClasses, type MotionTone } from './tone';

/** Tons que o indicador aceita: os que têm `*-foreground` no sistema. */
export type SegmentedTone = Exclude<MotionTone, 'whatsapp'>;

/** Texto sobre o indicador sólido — o par de token do estado. */
const TEXTO_NO_INDICADOR: Record<SegmentedTone, string> = {
  info: 'text-info-foreground',
  primary: 'text-primary-foreground',
  success: 'text-success-foreground',
  warning: 'text-warning-foreground',
  destructive: 'text-destructive-foreground',
};

function textoNoIndicador(tone: SegmentedTone): string {
  const classe = TEXTO_NO_INDICADOR[tone];
  if (!classe) {
    throw new Error(
      `SlidingSegmented: "${String(tone)}" não tem texto-sobre-cor no sistema. O indicador aceita info, primary, success, warning e destructive.`,
    );
  }
  return classe;
}

export interface SegmentedItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export interface SlidingSegmentedProps<T extends string = string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome do grupo para leitor de tela (ex.: "Período"). Obrigatório. */
  ariaLabel: string;
  /** Cor do indicador. Só os tons com par de texto do sistema (sem `whatsapp`). */
  tone?: SegmentedTone;
  /** Identificador do `layoutId` — único por instância na mesma tela. */
  layoutId?: string;
  className?: string;
}

export function SlidingSegmented<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel,
  tone = 'primary',
  layoutId = 'segmented-indicator',
  className,
}: SlidingSegmentedProps<T>) {
  const reduce = useReducedMotion() ?? false;
  const classes = toneClasses(tone);
  const textoEscolhido = textoNoIndicador(tone);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const atual = items.findIndex((item) => item.value === value);
    const passo =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!passo || items.length === 0) return;
    event.preventDefault();
    const destino = items[(atual + passo + items.length) % items.length];
    onChange(destino.value);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-value="${destino.value}"]`)
      ?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid="sliding-segmented"
      data-motion={reduce ? 'reduced' : 'full'}
      onKeyDown={onKeyDown}
      className={cn('relative inline-flex items-center gap-1 rounded-lg bg-muted p-1', className)}
    >
      {items.map((item) => {
        const selecionado = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={selecionado}
            tabIndex={selecionado ? 0 : -1}
            data-value={item.value}
            data-testid={`segmented-item-${item.value}`}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative z-10 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selecionado ? textoEscolhido : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selecionado ? (
              reduce ? (
                <span
                  aria-hidden="true"
                  data-testid="segmented-indicator"
                  data-motion="reduced"
                  className={cn('absolute inset-0 -z-10 rounded-md', classes.bg)}
                />
              ) : (
                <motion.span
                  aria-hidden="true"
                  data-testid="segmented-indicator"
                  data-motion="full"
                  layoutId={layoutId}
                  transition={zappSpring.snappy}
                  className={cn('absolute inset-0 -z-10 rounded-md', classes.bg)}
                />
              )
            ) : null}
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
