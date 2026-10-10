import { useCallback, useSyncExternalStore } from 'react';

/**
 * Etapa 81 — mobile: quadro, Sheet e card precisam da MESMA resposta sobre o
 * ambiente, senão o menu some onde o arrasto também não funciona. Uma fonte só
 * evita que `(pointer: coarse)` e o corte de `md` (768px) divirjam.
 */

function consultar(consulta: string): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(consulta).matches;
}

/**
 * Leitura VIVA de uma media query: o React assina o `matchMedia` e reprocessa
 * quando a resposta muda (rotação, troca de ponteiro) — sem estado local e sem
 * `useEffect` escrevendo estado. Fora do browser vale `false`.
 */
function useMedia(consulta: string): boolean {
  const assinar = useCallback((aoMudar: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => undefined;
    }
    const mq = window.matchMedia(consulta);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [consulta]);

  return useSyncExternalStore(assinar, () => consultar(consulta), () => false);
}

/** `pointer: coarse` — touch. Nele o arrasto dá lugar ao `MoveToMenu` (etapa 81). */
export function usePointerCoarse(): boolean {
  return useMedia('(pointer: coarse)');
}

/** Abaixo de `md` — o mesmo corte do Sheet (`side="bottom"`) e do `useIsMobile`. */
export function useNarrowViewport(): boolean {
  return useMedia('(max-width: 767px)');
}
