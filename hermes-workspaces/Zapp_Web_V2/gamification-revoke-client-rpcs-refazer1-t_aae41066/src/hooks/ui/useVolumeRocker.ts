import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';

const LONG_PRESS_MS = 400;

/**
 * Marca do painel de volume (ver `VolumeSliderPopoverContent`). O painel é montado num
 * portal do Radix, FORA do `rootRef`; sem esta marca o hook não teria como saber o que é
 * "dentro" e fecharia o painel no primeiro clique no próprio slider.
 */
export const VOLUME_PANEL_ATTRIBUTE = 'data-volume-panel';

/** O nó está no controle (gatilho) ou dentro do painel montado em portal. */
function dentroDoControle(node: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(node instanceof Element)) return false;
  if (root?.contains(node)) return true;
  const seletor = `[${VOLUME_PANEL_ATTRIBUTE}]`;
  return node.closest(seletor) !== null;
}

export interface UseVolumeRockerArgs {
  /** Passo do ajuste (scroll/setas), já no domínio do caller. */
  step: number;
  /** Ajusta o volume por `delta` (o clamp fica a cargo do caller). */
  onAdjust: (delta: number) => void;
  /** Alterna mudo/desmudo. */
  onToggleMute: () => void;
  /** Âncora onde a roda do mouse é ouvida (o <span> que embrulha o botão). */
  rootRef: RefObject<HTMLSpanElement | null>;
  /**
   * E16 — container do player. Os atalhos (setas, `M`, Enter) valem com o foco em
   * QUALQUER parte do player, não só no botão do volume; fora dele seguem inertes
   * (o app não captura teclado globalmente). O botão do volume continua funcionando
   * sozinho quando não há player em volta (sidebar).
   */
  playerRef?: RefObject<HTMLElement | null>;
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

/** O mínimo que os dois caminhos de teclado (botão e container) precisam do evento. */
interface AtalhoDeVolume {
  key: string;
  target: EventTarget | null;
  defaultPrevented: boolean;
  preventDefault: () => void;
}

interface AcoesDoAtalho {
  enabled: boolean;
  step: number;
  onAdjust: (delta: number) => void;
  onToggleMute: () => void;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * Núcleo dos atalhos, compartilhado pelo `onKeyDown` do botão (evento do React) e pelo
 * listener nativo do container (E16). Fonte única para os dois não divergirem.
 */
function aplicarAtalhoDeVolume(event: AtalhoDeVolume, acoes: AcoesDoAtalho): void {
  const { enabled, step, onAdjust, onToggleMute, setOpen } = acoes;
  if (!enabled) return;
  // O mesmo teclado chega pelos dois caminhos quando o foco está no botão (o nativo no
  // container roda antes do React, que escuta na raiz). Sem esta guarda, um ArrowUp
  // andaria duas casas.
  if (event.defaultPrevented) return;

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
    // Equivalente de teclado do clique: abre o painel. `preventDefault` impede o
    // `click` nativo do botão (que faria o mesmo) — mudo pelo teclado é Espaço ou `M`.
    event.preventDefault();
    setOpen(true);
  } else if (event.key === 'm' || event.key === 'M') {
    event.preventDefault();
    onToggleMute();
  }
}

/**
 * Lógica de interação compartilhada dos controles de volume (alertas e mídias):
 * clique = ABRE o painel (D01 — antes só abria com clique longo, e o usuário não
 * descobria o slider); clique longo continua abrindo (S18: compatível); setas ↑/↓ = ajuste
 * ±step; roda do mouse = ajuste ±step, mas SÓ com o painel aberto (B5 — rolar a sidebar
 * não muda mais o volume sem querer); tecla `M` = mudo; Enter = abre o painel.
 * O mudo rápido vive na tecla `M` e no botão grande dentro do painel; o clique longo
 * mantém a abertura do painel por compatibilidade com a etapa S18 do plano.
 *
 * O painel fecha com clique fora, Esc e perda de foco (D02), devolvendo o foco ao
 * gatilho — é o que o mantém utilizável também no TOQUE: o `click` que o navegador
 * dispara ao soltar o dedo só ABRE de novo, nunca fecha (B2).
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
  playerRef,
  enabled = true,
  wheelEnabled = enabled,
}: UseVolumeRockerArgs): VolumeRocker {
  const [open, setOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  /** Fecha o painel e, quando o foco ainda estava com ele, devolve o foco ao gatilho. */
  const fechar = useCallback(
    (devolverFoco: boolean) => {
      setOpen(false);
      if (!devolverFoco) return;
      rootRef.current?.querySelector('button')?.focus();
    },
    [rootRef],
  );

  // D02 — clique fora, Esc e perda de foco fecham o painel. Escutamos no `document`
  // porque o conteúdo do popover é um portal do Radix, fora da árvore do gatilho.
  useEffect(() => {
    if (!open || !enabled) return;
    const aoApontarFora = (event: PointerEvent) => {
      if (dentroDoControle(event.target, rootRef.current)) return;
      fechar(true);
    };
    const aoTeclarEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      fechar(true);
    };
    const aoMudarFoco = (event: FocusEvent) => {
      if (dentroDoControle(event.target, rootRef.current)) return;
      // O foco já está onde o usuário o colocou: fecha sem puxá-lo de volta.
      fechar(false);
    };
    document.addEventListener('pointerdown', aoApontarFora, true);
    document.addEventListener('keydown', aoTeclarEscape);
    document.addEventListener('focusin', aoMudarFoco);
    return () => {
      document.removeEventListener('pointerdown', aoApontarFora, true);
      document.removeEventListener('keydown', aoTeclarEscape);
      document.removeEventListener('focusin', aoMudarFoco);
    };
  }, [open, enabled, fechar, rootRef]);

  // Scroll sobre o ícone ajusta ±step, mas só com o painel ABERTO (B5): rolar a sidebar
  // com o cursor sobre o ícone mudava o volume sem o usuário pedir. Listener nativo
  // porque o `onWheel` do React é registrado como passivo e não consegue impedir a
  // página de rolar junto.
  useEffect(() => {
    const element = rootRef.current;
    if (!element || !wheelEnabled || !open) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      onAdjust(event.deltaY < 0 ? step : -step);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [rootRef, onAdjust, step, wheelEnabled, open]);

  // E16 — atalhos com o foco em qualquer parte do player. Nativo (não `onKeyDown` do
  // React) porque o alvo aqui é o container, e o teclado do React só chegaria ao nó
  // com foco. `rootRef.current` NÃO serve de escopo: ele cobre só o próprio controle.
  // Sem ref-espelho de propósito: escrever ref durante o render é proibido por
  // `react-hooks/refs` (a mesma regra que motivou a assinatura deste hook).
  useEffect(() => {
    const player = playerRef?.current;
    if (!player) return;
    const aoTeclar = (event: globalThis.KeyboardEvent) =>
      aplicarAtalhoDeVolume(event, { enabled, step, onAdjust, onToggleMute, setOpen });
    player.addEventListener('keydown', aoTeclar);
    return () => player.removeEventListener('keydown', aoTeclar);
  }, [playerRef, enabled, step, onAdjust, onToggleMute, setOpen]);

  const handleTriggerClick = useCallback(() => {
    if (!enabled) return;
    // D01 — o clique comum ABRE o painel. O `click` que o navegador dispara depois do
    // clique longo (e ao soltar o dedo, no toque) cai aqui: abrir de novo é inofensivo,
    // então o painel não fecha ao soltar o dedo (B2).
    setOpen(true);
  }, [enabled]);

  const handlePointerDown = useCallback(() => {
    if (!enabled) return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      // S18 do plano: clique longo continua abrindo o painel (compatibilidade).
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [enabled, clearLongPress]);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      aplicarAtalhoDeVolume(event, {
        enabled,
        step,
        onAdjust,
        onToggleMute,
        setOpen,
      });
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
