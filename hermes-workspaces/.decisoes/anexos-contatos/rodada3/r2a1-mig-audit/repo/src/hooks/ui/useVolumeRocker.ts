import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';

const LONG_PRESS_MS = 400;

export interface UseVolumeRockerArgs {
  /** Passo do ajuste (scroll/setas), já no domínio do caller. */
  step: number;
  /** Ajusta o volume por `delta` (o clamp fica a cargo do caller). */
  onAdjust: (delta: number) => void;
  /** Alterna mudo/desmudo. */
  onToggleMute: () => void;
  /** Âncora onde a roda do mouse é ouvida (o <span> que embrulha o botão). */
  rootRef: RefObject<HTMLSpanElement | null>;
  /** Habilita clique/long-press/setas. Padrão: true. */
  enabled?: boolean;
  /** Habilita o ajuste por scroll (roda). Padrão: `enabled`. */
  wheelEnabled?: boolean;
}

export interface VolumeRocker {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  clearLongPress: () => void;
  handleTriggerClick: () => void;
  handlePointerDown: () => void;
  handleTriggerKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Lógica de interação compartilhada dos controles de volume (alertas e mídias):
 * clique = mudo/desmudo (com dedup do clique longo), clique longo = abre o slider,
 * scroll = ajuste ±step, setas ↑/↓ = ajuste ±step, Enter = abre o slider
 * (equivalente de teclado do clique longo — sem ele, o popover era inalcançável
 * por teclado nas variantes sem chevron), tecla M = mudo.
 *
 * Extraído para não duplicar o mesmo código nos dois controles (a duplicação
 * derruba o Quality Gate do SonarCloud: ≤ 3%). O `rootRef` entra como argumento e
 * NÃO é devolvido no objeto (o `react-hooks/refs` proíbe acessar refs empacotadas
 * em objetos durante o render).
 */
export function useVolumeRocker({
  step,
  onAdjust,
  onToggleMute,
  rootRef,
  enabled = true,
  wheelEnabled = enabled,
}: UseVolumeRockerArgs): VolumeRocker {
  const [open, setOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  // Scroll sobre o ícone ajusta ±step. Listener nativo porque o `onWheel` do React
  // é registrado como passivo e não consegue impedir a página de rolar junto.
  useEffect(() => {
    const element = rootRef.current;
    if (!element || !wheelEnabled) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      onAdjust(event.deltaY < 0 ? step : -step);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [rootRef, onAdjust, step, wheelEnabled]);

  const handleTriggerClick = useCallback(() => {
    if (!enabled) return;
    if (longPressFiredRef.current) {
      // O clique longo já abriu o slider: o click do pointerup não muta.
      longPressFiredRef.current = false;
      return;
    }
    onToggleMute();
  }, [enabled, onToggleMute]);

  const handlePointerDown = useCallback(() => {
    if (!enabled) return;
    longPressFiredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [enabled, clearLongPress]);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!enabled) return;
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
        onAdjust(step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onAdjust(-step);
      } else if (event.key === 'Enter') {
        // Equivalente de teclado do clique longo: abre o slider. `preventDefault`
        // impede o `click` nativo do botão (que alternaria o mudo) — mudo pelo
        // teclado é Espaço ou `M`.
        event.preventDefault();
        setOpen(true);
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        onToggleMute();
      }
    },
    [enabled, onAdjust, onToggleMute, step, setOpen],
  );

  return {
    open,
    setOpen,
    clearLongPress,
    handleTriggerClick,
    handlePointerDown,
    handleTriggerKeyDown,
  };
}
