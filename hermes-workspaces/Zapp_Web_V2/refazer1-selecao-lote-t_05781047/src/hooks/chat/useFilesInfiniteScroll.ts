import { useEffect, useRef, type RefObject } from 'react';

/**
 * Etapa 41: dispara `onLoadMore` quando o sentinela no fim da lista entra na area visivel.
 *
 * O `IntersectionObserver` usa `root: null` (viewport) de proposito: o contêiner de rolagem
 * real da aba e o `Panel` de `ConversationTabContent` (overflow-y-auto), e o proprio observer
 * ja desconta o recorte dos ancestrais com overflow. `rootMargin` de 200px adianta a pagina
 * seguinte um pouco antes de o operador chegar ao fim.
 *
 * O `isFetching` vai por ref para nao recriar o observer a cada pagina e nao disparar duas
 * buscas simultaneas.
 */
export function useFilesInfiniteScroll(
  sentinelRef: RefObject<Element | null>,
  { hasMore, isFetching, onLoadMore }: { hasMore: boolean; isFetching: boolean; onLoadMore: () => void },
): void {
  const onLoadMoreRef = useRef(onLoadMore);
  const isFetchingRef = useRef(isFetching);

  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);
  useEffect(() => { isFetchingRef.current = isFetching; }, [isFetching]);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinelRef, hasMore]);
}
