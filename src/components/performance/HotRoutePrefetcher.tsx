import { useEffect } from 'react';

import { getLogger } from '@/lib/logger';
import { HOT_VIEWS, PAUSA_ENTRE_CHUNKS_MS, shouldSkipPrefetch, type ViewLoaders } from './hotRoutePrefetch';

const log = getLogger('HotRoutePrefetcher');

/**
 * Prefetch das views quentes — E35.
 *
 * Carrega, **depois da primeira pintura e em tempo ocioso**, os chunks das telas
 * que o operador quase sempre abre em seguida. Nenhum chunk entra no bundle
 * inicial: todos continuam lazy, apenas saem do disco/rede antes do clique.
 *
 * Medido em 03/10/2026: o `initial-js` permanece em 337,8 KB (budget 341 KB) —
 * o prefetch não altera o grafo estático do entry. Ver
 * `docs/audits/prefetch-views-quentes-2026-10-03.md`.
 *
 * `views` é injetável para teste (o ESM cacheia os módulos, então espiar
 * `import()` entre casos não funciona: o primeiro caso "queima" o cache);
 * em produção usa `HOT_VIEWS`.
 */
export function HotRoutePrefetcher({ views = HOT_VIEWS }: { views?: ViewLoaders }): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (shouldSkipPrefetch()) {
      log.info('Prefetch de views quentes ignorado (conexão lenta ou economia de dados).');
      return;
    }

    let cancelado = false;

    const prefetch = async () => {
      for (const [nome, carregar] of Object.entries(views)) {
        if (cancelado) return;
        try {
          await carregar();
        } catch (err) {
          log.warn(`Falha ao pré-carregar a view "${nome}"; a view carrega sob demanda.`, err);
        }
        await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CHUNKS_MS));
      }
    };

    const idle =
      window.requestIdleCallback?.bind(window) ??
      ((cb: IdleRequestCallback) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 1));

    const handle = idle(() => void prefetch());

    return () => {
      cancelado = true;
      window.cancelIdleCallback?.(handle as number);
    };
  }, [views]);

  return null;
}
