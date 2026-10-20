/**
 * Testes do toast com Desfazer (R2-MOD-053).
 *
 * O defeito: o clique em "Desfazer" chamava `onUndo()` e anunciava
 * "Ação desfeita" na MESMA linha, sem esperar a reversão gravar. Se a escrita
 * falhasse, o toast mentia sobre o resultado. Aqui provamos o contrato correto:
 * sucesso só depois do await; erro da reversão vira aviso e reoferece o Desfazer.
 *
 * `toast` do sonner tem de ser chamável (o undoToast usa `toast(message, opts)`)
 * E ter os métodos `.success`/`.error`, por isso o mock é uma função com eles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastMock } = vi.hoisted(() => {
  const fn = vi.fn();
  const withMethods = Object.assign(fn, { success: vi.fn(), error: vi.fn(), info: vi.fn() });
  return { toastMock: withMethods };
});

vi.mock('sonner', () => ({ toast: toastMock }));

import { undoToast } from '@/lib/undoToast';

type ToastOpts = {
  action?: { label: string; onClick: () => void | Promise<void> };
};

/** Última chamada a `toast(message, opts)`. */
function ultimoToast(): [string, ToastOpts] {
  const calls = toastMock.mock.calls;
  return calls[calls.length - 1] as [string, ToastOpts];
}

describe('undoToast — R2-MOD-053', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('só anuncia "Ação desfeita" depois de a reversão resolver', async () => {
    let resolveUndo!: () => void;
    const onUndo = vi.fn(() => new Promise<void>((r) => { resolveUndo = r; }));

    undoToast({ message: 'Tarefa removida', onUndo });
    const [, opts] = ultimoToast();
    const clique = opts.action!.onClick();

    // Enquanto a escrita não resolve, nada de "Ação desfeita".
    expect(toastMock.success).not.toHaveBeenCalled();

    resolveUndo();
    await clique;
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith('Ação desfeita', expect.anything());
  });

  it('reversão que falha não anuncia sucesso e reoferece o Desfazer', async () => {
    const onUndo = vi.fn().mockRejectedValue(new Error('boom'));

    undoToast({ message: 'Tarefa removida', onUndo });
    const [, opts] = ultimoToast();

    await opts.action!.onClick();

    expect(onUndo).toHaveBeenCalledTimes(1);
    // não mentiu: nada de "Ação desfeita"
    expect(toastMock.success).not.toHaveBeenCalledWith('Ação desfeita', expect.anything());
    // avisou o erro...
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    // ...e reofereceu a mesma ação, com o contexto preservado (mesma mensagem).
    const [msg, reaberto] = ultimoToast();
    expect(msg).toBe('Tarefa removida');
    expect(reaberto.action?.label).toBe('Desfazer');
    expect(reaberto.action?.onClick).toEqual(expect.any(Function));
  });
});
