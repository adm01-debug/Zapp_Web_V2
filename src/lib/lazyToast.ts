import type { toast as SonnerToast } from 'sonner';

/**
 * t_fd52bf49 — `toast` do sonner SEM colocar a lib no bundle inicial.
 *
 * A pilha de sessão de telefonia (`CallSessionProvider` → `useSipClient` →
 * `useSipConnection`, `sipProvisioning`, `useMicrophoneGuard`,
 * `useCallEngineSink`) é montada no boot e importava `toast` de 'sonner'
 * estaticamente: só isso já punha o chunk da lib (~9 KB gzip) no modulepreload
 * do `index.html` (medido pelo `bundle-budget.mjs` em 09/10/2026).
 *
 * Esta fachada tem a MESMA chamada (`toast.error(msg)` etc.) e pede a lib por
 * `import()` assim que o módulo é avaliado — logo depois do entry, fora do
 * caminho do first paint. Com a lib carregada (o caso normal: estes toasts só
 * saem depois de login, provisionamento ou chamada), a chamada é síncrona,
 * como antes. Se alguém chamar antes de a lib chegar, a chamada espera o
 * `import()` e sai em seguida — nada se perde (o sonner também guarda o toast
 * até o <Toaster> lazy montar). Falha ao carregar a lib vira `console.warn`,
 * nunca exceção no meio da telefonia.
 */
type Toast = typeof SonnerToast;
type Tipo = 'success' | 'error' | 'info' | 'warning';
type Args = Parameters<Toast['error']>;

let carregado: Toast | null = null;

const carregando: Promise<Toast> = import('sonner').then((modulo) => {
  carregado = modulo.toast;
  return modulo.toast;
});
// A falha é tratada em cada chamada; aqui só não deixa a rejeição solta.
carregando.catch(() => {});

function disparar(tipo: Tipo, args: Args): void {
  if (carregado) {
    carregado[tipo](...args);
    return;
  }
  void carregando
    .then((toast) => { toast[tipo](...args); })
    .catch((erro) => console.warn('[toast] não disparou:', erro));
}

export const toast = {
  success: (...args: Args) => disparar('success', args),
  error: (...args: Args) => disparar('error', args),
  info: (...args: Args) => disparar('info', args),
  warning: (...args: Args) => disparar('warning', args),
};
