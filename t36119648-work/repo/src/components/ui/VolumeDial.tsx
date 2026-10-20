import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface VolumeDialProps {
  /** Valor atual (controlado). */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Estado mudo: arco esmaecido, knob neutro e centro com "Mudo". */
  muted?: boolean;
  onChange: (value: number) => void;
  /** Nome acessível do dial (ex.: "Volume dos alertas"). */
  ariaLabel: string;
  /** Texto do centro e do `aria-valuetext` quando informado (ex.: "70%" / "Mudo"). */
  valueLabel?: string;
  /** Diâmetro em px. Padrão 96 (proporcional em qualquer tamanho). */
  size?: number;
}

/** Varredura do arco: 270°, da base esquerda à base direita (abertura embaixo). */
const ARCO_GRAUS = 270;
/** Ângulo (graus de tela, 0=direita, 90=baixo) onde o arco começa. */
const INICIO_GRAUS = 135;
/** Raio e espessura do anel, em unidades do viewBox 100×100 do SVG. */
const RAIO = 42;
const ESPESSURA = 8;
/** Duração da contagem do número, em segundos. */
const DURACAO_CONTAGEM = 0.25;

function limitar(valor: number, min: number, max: number) {
  return Math.min(max, Math.max(min, valor));
}

/** Ajusta o valor bruto à grade de `step` e aos limites, sem sobras de ponto flutuante. */
function quantizar(bruto: number, min: number, max: number, step: number) {
  const passo = step > 0 ? step : 1;
  const passos = Math.round((bruto - min) / passo);
  return limitar(Number((min + passos * passo).toFixed(4)), min, max);
}

/** Ângulo do ponteiro em relação ao centro, em graus de tela (0=direita, 90=baixo). */
function anguloDoPonteiro(cx: number, cy: number, px: number, py: number) {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

/**
 * Converte a posição angular em valor. Devolve `null` quando o ponteiro está na
 * abertura inferior: ali o valor NÃO muda, o que evita o salto 100 → 0 ao cruzar o vão.
 */
function valorDoAngulo(angulo: number, min: number, max: number, step: number) {
  const t = (((angulo - INICIO_GRAUS) % 360) + 360) % 360;
  if (t > ARCO_GRAUS) return null;
  const fracao = t / ARCO_GRAUS;
  return quantizar(min + fracao * (max - min), min, max, step);
}

/**
 * Dial circular de volume no padrão "Circular Volume Dial" (slider-08 do 21st.dev),
 * sem as dependências do original: só framer-motion (já no projeto) e tokens do sistema.
 *
 * O anel é um SVG com varredura de 270° (abertura embaixo): trilho neutro + arco de valor
 * em gradiente de `primary` para a cor clara do próprio primary (`--primary-glow`). O knob
 * acompanha o arco, o valor (%) fica no centro em `tabular-nums` e conta até o novo valor
 * com uma mola curta. Arrastar em qualquer ponto do anel/knob converte o ângulo do ponteiro
 * em valor (`setPointerCapture` + `touch-action: none`); a roda do mouse NÃO muda o valor.
 */
export function VolumeDial({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  muted = false,
  onChange,
  ariaLabel,
  valueLabel,
  size = 96,
}: VolumeDialProps) {
  // `useId` devolve algo como ":r0:" (com dois-pontos), inválido em `url(#…)`.
  const idGradiente = `volume-dial-${useId().replace(/:/g, '')}`;
  const reduzirMovimento = useReducedMotion() ?? false;
  const [mostrado, setMostrado] = useState(value);
  const mostradoRef = useRef(value);
  const arrastando = useRef(false);

  useEffect(() => {
    mostradoRef.current = mostrado;
  }, [mostrado]);

  useEffect(() => {
    if (reduzirMovimento) return;
    const de = mostradoRef.current;
    if (de === value) return;
    const controles = animate(de, value, {
      duration: DURACAO_CONTAGEM,
      ease: 'easeOut',
      onUpdate: (v) => setMostrado(Math.round(v)),
      onComplete: () => setMostrado(value),
    });
    return () => controles.stop();
  }, [value, reduzirMovimento]);

  const passo = step > 0 ? step : 1;
  // Com movimento reduzido o número exibido é o valor direto (sem animação).
  const numeroExibido = reduzirMovimento ? value : mostrado;
  const faixa = max - min;
  const fracao = faixa > 0 ? limitar((value - min) / faixa, 0, 1) : 0;
  const anguloTela = ((INICIO_GRAUS + fracao * ARCO_GRAUS) * Math.PI) / 180;
  const raioPx = (RAIO / 100) * size;
  const knobX = Math.cos(anguloTela) * raioPx;
  const knobY = Math.sin(anguloTela) * raioPx;

  const textoCentro = muted ? 'Mudo' : (valueLabel ?? `${numeroExibido}%`);
  const textoFalado = muted ? 'Mudo' : (valueLabel ?? `${value} por cento`);

  const aplicar = (proximo: number) => {
    const v = limitar(proximo, min, max);
    if (v !== value) onChange(v);
  };

  const porPonteiro = (evento: ReactPointerEvent<HTMLDivElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const v = valorDoAngulo(anguloDoPonteiro(cx, cy, evento.clientX, evento.clientY), min, max, step);
    if (v !== null && v !== value) onChange(v);
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let proximo: number | null = null;
    switch (evento.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        proximo = value + passo;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        proximo = value - passo;
        break;
      case 'PageUp':
        proximo = value + passo * 5;
        break;
      case 'PageDown':
        proximo = value - passo * 5;
        break;
      case 'Home':
        proximo = min;
        break;
      case 'End':
        proximo = max;
        break;
      default:
        return;
    }
    evento.preventDefault();
    aplicar(proximo);
  };

  const corKnob = muted ? 'bg-muted-foreground' : 'bg-primary';
  const knobClasse = cn(
    'h-3.5 w-3.5 rounded-full shadow-glow-primary transition-transform group-hover:scale-110',
    corKnob,
  );

  return (
    <div
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={textoFalado}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={aoTeclar}
      onPointerDown={(e) => {
        if (disabled) return;
        arrastando.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        porPonteiro(e);
      }}
      onPointerMove={(e) => {
        if (disabled || !arrastando.current) return;
        porPonteiro(e);
      }}
      onPointerUp={(e) => {
        arrastando.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={(e) => {
        arrastando.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      style={{ width: size, height: size }}
      className={cn(
        'group relative shrink-0 touch-none select-none rounded-full outline-none transition-shadow',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={idGradiente} gradientUnits="userSpaceOnUse" x1="16" y1="92" x2="84" y2="8">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary-glow))" />
          </linearGradient>
        </defs>

        <circle
          cx={50}
          cy={50}
          r={RAIO}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          pathLength={ARCO_GRAUS}
          strokeDasharray={`${ARCO_GRAUS} ${ARCO_GRAUS}`}
          transform={`rotate(${INICIO_GRAUS} 50 50)`}
        />

        <circle
          cx={50}
          cy={50}
          r={RAIO}
          fill="none"
          stroke={`url(#${idGradiente})`}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          pathLength={ARCO_GRAUS}
          strokeDasharray={`${fracao * ARCO_GRAUS} ${ARCO_GRAUS}`}
          transform={`rotate(${INICIO_GRAUS} 50 50)`}
          className={cn(muted && 'opacity-40')}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {reduzirMovimento ? (
          <div className={knobClasse} style={{ transform: `translate(${knobX}px, ${knobY}px)` }} />
        ) : (
          <motion.div
            className={knobClasse}
            animate={{ x: knobX, y: knobY }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          />
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          data-testid="volume-dial-value"
          aria-hidden="true"
          className="text-2xl font-semibold leading-none tabular-nums text-foreground"
        >
          {textoCentro}
        </span>
      </div>
    </div>
  );
}
