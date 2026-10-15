import * as React from "react";

import { fecharToast, toast as toastSonner, toastNeutro } from "@/lib/lazyToast";

/**
 * t_a0562af3 — adaptador do toast legado (Radix) sobre o Sonner.
 *
 * O app fala com UM sistema de toast: o viewport do Sonner
 * (`src/components/ui/sonner.tsx`, montado lazy em `App.tsx`). Esta camada
 * mantém a chamada antiga — `toast({ title, description, variant, duration,
 * action })` e `useToast()` — para os consumidores que já existem não precisarem
 * mudar nada.
 *
 * A lib entra por `@/lib/lazyToast` (import() dinâmico): `use-toast` está no
 * grafo ESTÁTICO do entry (via `QuarantineMonitorProvider` → `AppProviders`) e
 * um `import ... from 'sonner'` daqui devolveria a lib ao bundle inicial — o que
 * `src/__tests__/bundle-inicial.bundle.test.ts` guarda desde t_fd52bf49.
 *
 * Não existe mais fila de toasts: quem desenha é o Sonner. A lista `abertos`
 * existe só para o `update({ id, ... })` saber o que preservar (a chamada antiga
 * atualizava só os campos informados) e para o `dismiss()` sem id fechar
 * exatamente os toasts abertos por esta API — nunca um toast de outro chamador.
 */

/** Variantes da API legada (shadcn: `default | destructive`). */
export type ToastVariant = "default" | "destructive";

/**
 * Ação: as duas formas que existem no repositório — o objeto `{ label, onClick }`
 * (usado por `useActionFeedback`) e o `<ToastAction>` do Radix, cujo texto vem
 * em `children` e o clique em `onClick`.
 */
export type ToastAction =
  | React.ReactNode
  | { label: React.ReactNode; onClick?: () => void };

export type Toast = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
  action?: ToastAction;
};

export type ToasterToast = Toast & { id: string };

/** Props de cada toast aberto por esta API (para o `update` fundir só o que veio). */
const abertos = new Map<string, Toast>();

let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

/** Opções que a fachada lazy aceita (é o que o Sonner chama de `ExternalToast`). */
type OpcoesSonner = NonNullable<Parameters<typeof toastNeutro>[1]>;
type AcaoSonner = NonNullable<OpcoesSonner["action"]>;

/** A ação legada no formato que o Sonner aceita (`{ label, onClick }`). */
function acaoDoSonner(action: ToastAction | undefined): AcaoSonner | undefined {
  if (!action) return undefined;
  if (React.isValidElement(action)) {
    const props = action.props as { children?: React.ReactNode; onClick?: () => void };
    return { label: props.children, onClick: props.onClick ?? (() => {}) };
  }
  return action as AcaoSonner;
}

function opcoes(id: string, props: Toast): OpcoesSonner {
  return {
    id,
    description: props.description,
    duration: props.duration,
    action: acaoDoSonner(props.action),
    // O Sonner avisa quando o toast sai (autoClose ou clique): o registro não
    // pode continuar contando um toast que já não está na tela.
    onDismiss: () => {
      abertos.delete(id);
    },
  };
}

function enviar(id: string, props: Toast): void {
  if (props.variant === "destructive") {
    toastSonner.error(props.title, opcoes(id, props));
    return;
  }
  toastNeutro(props.title, opcoes(id, props));
}

function fechar(id: string): void {
  abertos.delete(id);
  fecharToast(id);
}

function toast({ ...props }: Toast) {
  const id = genId();
  abertos.set(id, props);
  enviar(id, props);

  return {
    id,
    update: (novos: Partial<Toast> & { id: string }) => {
      const { id: ignorado, ...resto } = novos;
      void ignorado;
      const fundido: Toast = { ...(abertos.get(id) ?? {}), ...resto };
      abertos.set(id, fundido);
      enviar(id, fundido);
    },
    dismiss: () => fechar(id),
  };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => {
      if (toastId) {
        fechar(toastId);
        return;
      }
      [...abertos.keys()].forEach(fechar);
    },
  };
}

export { useToast, toast };
