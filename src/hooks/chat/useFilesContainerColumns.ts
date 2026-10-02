import { useEffect, useState, type RefObject } from 'react';
import { FILES_COLUMNS, type FilesColumns } from '@/hooks/chat/useFilesViewState';

/**
 * Capacidade de colunas do Grid medida pelo CONTENINER (etapa 07).
 *
 * `window.innerWidth` nao serve aqui: o painel central do inbox encolhe quando a sidebar
 * ou os detalhes do contato abrem, e o que importa e o espaco real do grid. O
 * `ResizeObserver` observa o proprio elemento e o rAF evita recalculo por pixel arrastado.
 */

export const MIN_CARD_WIDTH = 168;
export const CARD_GAP = 12;

export interface ColumnOption {
  n: FilesColumns;
  fits: boolean;
}

/** Quantos cartoes de 168 px cabem, com 12 px de espaco entre eles. Nunca menos de 1. */
export function columnsCapacity(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
}

/**
 * Maior opcao de [3,4,5,6,8] que caiba em `min(preferred, capacity)`. Capacidade 7 com
 * preferencia 8 devolve 6 (7 nao e opcao). Abaixo de 3 colunas devolve a propria
 * capacidade (1 ou 2), que e a adaptacao automatica em painel estreito.
 */
export function effectiveColumns(capacity: number, preferred: FilesColumns): number {
  const ceiling = Math.min(preferred, capacity);
  const options = FILES_COLUMNS.filter((n) => n <= ceiling);
  if (options.length > 0) return options[options.length - 1];
  return capacity;
}

export interface FilesContainerColumns {
  /** Colunas a renderizar. Enquanto nao ha medida, respeita a preferencia do operador. */
  effective: number;
  /** Capacidade medida do contêiner; `null` antes da primeira medicao. */
  capacity: number | null;
  /** As 5 opcoes do seletor, com `fits` para desabilitar (nunca esconder). */
  available: ColumnOption[];
}

export function useFilesContainerColumns(
  ref: RefObject<HTMLElement | null>,
  preferred: FilesColumns,
): FilesContainerColumns {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      setWidth(element.getBoundingClientRect().width);
    };
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure);
    });

    observer.observe(element);
    measure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);

  const capacity = width === null ? null : columnsCapacity(width);

  return {
    effective: capacity === null ? preferred : effectiveColumns(capacity, preferred),
    capacity,
    available: FILES_COLUMNS.map((n) => ({ n, fits: capacity === null ? true : n <= capacity })),
  };
}
