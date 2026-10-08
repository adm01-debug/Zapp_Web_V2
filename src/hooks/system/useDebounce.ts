import { useCallback, useEffect, useRef } from 'react';

export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ao desmontar, o disparo pendente é cancelado: sem isso o callback roda depois que o componente
  // (e, nos testes, o ambiente jsdom) já saiu e tenta atualizar estado inexistente — no CI sob carga
  // isso virava "ReferenceError: window is not defined" e reprovava o job mesmo com todos os testes verdes.
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}
