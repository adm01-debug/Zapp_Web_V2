/**
 * t_a0562af3 — adaptador do toast legado sobre o Sonner.
 *
 * O app tem UM sistema de toast: o viewport do Sonner (`src/components/ui/sonner.tsx`,
 * montado lazy em `App.tsx`). Estes casos provam que a chamada antiga
 * (`toast({ title, description, variant, duration, action })` e `useToast()`)
 * chega ao Sonner com os mesmos campos e que id/update/dismiss continuam
 * valendo sem a fila do Radix:
 *  - `variant: 'default'` → chamada neutra; `'destructive'` → `toast.error`;
 *  - `id` sai na hora (síncrono) e `update({ id, ... })` funde só o que veio;
 *  - `dismiss(id)` fecha aquele; `useToast().dismiss()` fecha os abertos;
 *  - `action` nas duas formas que existem no repositório: `{ label, onClick }`
 *    e o `<ToastAction>` do Radix (children + onClick);
 *  - `useToast()` não devolve mais a fila de toasts do Radix (o `<Toaster/>`
 *    do Radix saiu do app).
 *
 * `@/lib/lazyToast` é dublado — é quem fala com a lib (contrato provado em
 * `src/lib/__tests__/lazyToast.test.ts`), então nada aqui depende do bundle.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  neutro: vi.fn(),
  error: vi.fn(),
  fechar: vi.fn(),
}));

vi.mock("@/lib/lazyToast", () => ({
  toast: { success: vi.fn(), error: sonner.error, info: vi.fn(), warning: vi.fn() },
  toastNeutro: sonner.neutro,
  fecharToast: sonner.fechar,
}));

import { toast, useToast } from "../use-toast";

beforeEach(() => {
  useToast().dismiss(); // fecha o que sobrou do caso anterior (antes de zerar os espiões)
  vi.clearAllMocks();
});

describe("use-toast — adaptador sobre o Sonner", () => {
  it("variant default vai pela chamada neutra, com title/description/duration", () => {
    toast({
      title: "Sincronizando histórico...",
      description: "Isso pode levar alguns minutos.",
      duration: 3000,
    });

    expect(sonner.neutro).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = sonner.neutro.mock.calls[0];
    expect(titulo).toBe("Sincronizando histórico...");
    expect(opcoes).toMatchObject({ description: "Isso pode levar alguns minutos.", duration: 3000 });
    expect(typeof opcoes.id).toBe("string");
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("variant destructive vira toast.error", () => {
    toast({ title: "Erro na sincronização", description: "sem rede", variant: "destructive" });

    expect(sonner.error).toHaveBeenCalledTimes(1);
    expect(sonner.error.mock.calls[0][0]).toBe("Erro na sincronização");
    expect(sonner.neutro).not.toHaveBeenCalled();
  });

  it("id é síncrono e update funde só os campos informados, no MESMO id", () => {
    const { id, update } = toast({ title: "Processando", description: "⟳ Processando 0 de 3..." });
    expect(typeof id).toBe("string");

    update({ id, description: "⟳ Processando 1 de 3..." });

    expect(sonner.neutro).toHaveBeenCalledTimes(2);
    const [titulo, opcoes] = sonner.neutro.mock.calls[1];
    expect(titulo).toBe("Processando"); // título preservado
    expect(opcoes.id).toBe(id); // mesma linha do Sonner, não um toast novo
    expect(opcoes.description).toBe("⟳ Processando 1 de 3...");
  });

  it("dismiss(id) fecha só aquele toast; useToast().dismiss() fecha os abertos", () => {
    const a = toast({ title: "A" });
    const b = toast({ title: "B" });

    a.dismiss();
    expect(sonner.fechar).toHaveBeenCalledTimes(1);
    expect(sonner.fechar).toHaveBeenCalledWith(a.id);

    useToast().dismiss();
    expect(sonner.fechar).toHaveBeenCalledTimes(2);
    expect(sonner.fechar).toHaveBeenLastCalledWith(b.id);
  });

  it("toast que o Sonner fecha sozinho sai do registro e não é fechado de novo", () => {
    toast({ title: "Some sozinho" });
    const opcoes = sonner.neutro.mock.calls[0][1];

    opcoes.onDismiss(); // o Sonner avisa que o toast saiu (autoClose)

    useToast().dismiss();
    expect(sonner.fechar).not.toHaveBeenCalled();
  });

  it("action aceita { label, onClick } e o <ToastAction> do Radix", () => {
    const onClick = vi.fn();
    toast({ title: "Enviado", action: { label: "Desfazer", onClick } });
    expect(sonner.neutro.mock.calls[0][1].action).toEqual({ label: "Desfazer", onClick });

    const clicar = vi.fn();
    toast({ title: "Enviado", action: <button onClick={clicar}>Desfazer</button> });
    const acao = sonner.neutro.mock.calls[1][1].action;
    expect(acao.label).toBe("Desfazer");
    expect(acao.onClick).toBe(clicar);
  });

  it("useToast() devolve só toast e dismiss — a fila do Radix saiu do app", () => {
    expect(Object.keys(useToast()).sort()).toEqual(["dismiss", "toast"]);
    expect(useToast().toast).toBe(toast);
  });
});
