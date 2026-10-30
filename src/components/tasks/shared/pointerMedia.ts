import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

/**
 * Etapa 094 — no toque o arrasto não pode nascer de um swipe: a rolagem da tela
 * é do usuário. Uma pressão longa (300 ms) "arma" a coluna; a partir daí os
 * cartões aceitam arrasto até um toque curto desarmar de novo.
 *
 * No ponteiro fino (mouse) nada muda: `armado` já nasce `true` e o arrasto é o
 * de sempre. É a MESMA `(pointer: coarse)` do `usePointerCoarse` que decide —
 * sem segunda fonte sobre o ambiente.
 */
export function usePressaoLonga(ms = 300): {
  armado: boolean;
  aoPressionar: () => void;
  aoSoltar: () => void;
} {
  const grosso = usePointerCoarse();
  const [armou, setArmou] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armouAgora = useRef(false);

  const cancelar = useCallback(() => {
    if (relogio.current != null) {
      clearTimeout(relogio.current);
      relogio.current = null;
    }
  }, []);

  // Nada pode ficar pendente depois que a coluna sai da tela.
  useEffect(() => cancelar, [cancelar]);

  const aoPressionar = useCallback(() => {
    if (!grosso) return;
    armouAgora.current = false;
    cancelar();
    relogio.current = setTimeout(() => {
      armouAgora.current = true;
      setArmou(true);
    }, ms);
  }, [grosso, cancelar, ms]);

  const aoSoltar = useCallback(() => {
    cancelar();
    // Toque curto desarma; a pressão longa recém-feita continua armada para o
    // arrasto seguinte (o toque que armou já foi recusado pela lib de DnD).
    if (!armouAgora.current) setArmou(false);
    armouAgora.current = false;
  }, [cancelar]);

  return { armado: !grosso || armou, aoPressionar, aoSoltar };
}
