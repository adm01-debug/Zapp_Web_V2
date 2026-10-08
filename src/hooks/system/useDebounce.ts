import { useCallback, useEffect, useRef } from 'react';

export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancela o disparo pendente ao desmontar: sem isso o callback agendado roda depois que o
  // componente (e, nos testes, o jsdom) já saiu. No CI isso virava um erro não tratado
  // ("window is not defined") que reprovava o job Unit Tests mesmo com todos os testes verdes.
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
