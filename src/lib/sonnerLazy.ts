type ToastOptions = {
  description?: string;
  duration?: number;
  [key: string]: unknown;
};

type ToastKind = 'error' | 'info' | 'success' | 'warning';

function dispararToast(kind: ToastKind, message: string, options?: ToastOptions) {
  void import('sonner')
    .then(({ toast }) => {
      const exibir = toast[kind] as (mensagem: string, opcoes?: ToastOptions) => void;
      if (options === undefined) exibir(message);
      else exibir(message, options);
    })
    .catch((erro) => console.warn('[sonner] toast não disparou:', erro));
}

export function toastError(message: string, options?: ToastOptions) {
  dispararToast('error', message, options);
}

export function toastInfo(message: string, options?: ToastOptions) {
  dispararToast('info', message, options);
}

export function toastSuccess(message: string, options?: ToastOptions) {
  dispararToast('success', message, options);
}

export function toastWarning(message: string, options?: ToastOptions) {
  dispararToast('warning', message, options);
}
