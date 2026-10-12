import { lazy } from 'react';
import { isChunkLoadError, triggerChunkReload } from '@/lib/chunkReload';

/**
 * Retry wrapper for lazy imports to handle transient network failures (503, HMR).
 *
 * Falha de chunk (hash de deploy antigo) NAO entra no laco de tentativas: a
 * instancia React.lazy guarda a rejeicao e a repetiria sem novo fetch — seriam
 * ~3 s perdidos por deploy sem chance de sucesso. Ela dispara a recarga da
 * pagina na hora (orcamento/cooldown em src/lib/chunkReload.ts) e relanca.
 * Outros erros de rede seguem com espera crescente (1 s x tentativa).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> {
  return lazy(() => {
    let attempt = 0;
    const load = (): Promise<{ default: T }> =>
      factory().catch((err: unknown) => {
        if (isChunkLoadError(err)) {
          triggerChunkReload();
          throw err;
        }
        attempt++;
        if (attempt >= retries) throw err;
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(load()), 1000 * attempt)
        );
      });
    return load();
  });
}
