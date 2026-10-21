import type { ReactNode } from 'react';

/**
 * t_fd52bf49 — `toast` do sonner SEM colocar a lib no bundle inicial.
 *
 * A pilha de sessão de telefonia (`CallSessionProvider` → `useSipClient` →
 * `useSipConnection`, `sipProvisioning`, `useMicrophoneGuard`,
 * `useCallEngineSink`) é montada no boot e PRECISA avisar por toast — mas
 * nenhum módulo do grafo estático do entry pode referenciar o `sonner`
 * (nem `import` estático, nem `import()` dinâmico: o helper de preload do
 * Vite/Rolldown vira import estático do chunk da lib e o
 * `bundle-inicial.bundle.test.ts` reprova).
 *
 * Por isso esta fachada NÃO importa o `sonner`: quem carrega a lib é o
 * viewport lazy (`@/components/ui/sonner`, montado no boot pelos
 * `DeferredProviders`), que REGISTRA o `toast` real aqui na avaliação do
 * módulo (`registrarToast`). Chamadas feitas antes do registro ficam na fila
 * e saem em seguida — nada se perde. Com a lib carregada (o caso normal:
 * estes toasts só saem depois de login, provisionamento ou chamada), a
 * chamada é síncrona, como antes.
 *
 * Esta fachada tem a MESMA chamada (`toast.error(msg)` etc.).
 */

export interface LazyToastOptions {
  description?: ReactNode;
  duration?: number;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
  icon?: ReactNode;
  [chave: string]: unknown;
}

export type LazyToastFn = (message: string, options?: LazyToastOptions) => void;

export interface ToastLike {
  success: LazyToastFn;
  error: LazyToastFn;
  info: LazyToastFn;
  warning: LazyToastFn;
}

let pronto: ToastLike | null = null;
const fila: Array<() => void> = [];

/** Chamado pelo viewport lazy quando a lib chega (avaliação do módulo). */
export function registrarToast(impl: ToastLike): void {
  pronto = impl;
  while (fila.length) fila.shift()?.();
}

type Tipo = keyof ToastLike;
type Args = [message: string, options?: LazyToastOptions];

function disparar(tipo: Tipo, args: Args): void {
  if (pronto) {
    pronto[tipo](...args);
    return;
  }
  fila.push(() => {
    pronto?.[tipo](...args);
  });
}

export const toast: ToastLike = {
  success: (...args: Args) => disparar('success', args),
  error: (...args: Args) => disparar('error', args),
  info: (...args: Args) => disparar('info', args),
  warning: (...args: Args) => disparar('warning', args),
};
