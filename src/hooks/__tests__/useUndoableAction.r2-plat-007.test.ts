/**
 * R2-PLAT-007 — "Desfazer no aviso anterior reverte a operação seguinte de arquivamento".
 *
 * Cadeia real: RealtimeInboxView → useInboxBulkActions.bulkArchive → useUndoableAction.execute.
 * O teste chama o hook REAL com dois lotes seguidos (dentro da janela de undo) e aciona o
 * Desfazer de cada aviso: nenhum aviso pode operar sobre a operação do outro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface ToastActionBinding {
  label: string;
  onClick: () => void | Promise<void>;
}
interface ToastOptionsCapture {
  duration?: number;
  action?: ToastActionBinding;
}
interface ToastCallCapture {
  id: string;
  message: string;
  options: ToastOptionsCapture;
}

const h = vi.hoisted(() => {
  const calls: ToastCallCapture[] = [];
  let seq = 0;
  const success = vi.fn((message: string, options?: ToastOptionsCapture) => {
    const id = `toast-${++seq}`;
    calls.push({ id, message, options: options ?? {} });
    return id;
  });
  return { calls, success, dismiss: vi.fn(), error: vi.fn() };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: h.success,
    error: h.error,
    dismiss: h.dismiss,
  }),
}));

import { useUndoableAction } from '@/hooks/system/useUndoableAction';

const avisoDe = (mensagem: string): ToastCallCapture => {
  const call = h.calls.find((c) => c.message === mensagem);
  if (!call) throw new Error(`aviso "${mensagem}" não foi exibido`);
  return call;
};

const desfazerDe = (mensagem: string): ToastActionBinding => {
  const action = avisoDe(mensagem).options.action;
  if (!action) throw new Error(`aviso "${mensagem}" sem botão Desfazer`);
  return action;
};

describe('useUndoableAction — R2-PLAT-007 (desfazer do aviso anterior)', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.success.mockClear();
    h.dismiss.mockClear();
    h.error.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('desfazer no aviso anterior não executa o undo do lote seguinte', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const onCommitLoteA = vi.fn();
    const undoLoteA = vi.fn().mockResolvedValue(undefined);
    const undoLoteB = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote A arquivado',
        undoMessage: 'Arquivamento A desfeito',
        action: vi.fn().mockResolvedValue('A'),
        undoAction: undoLoteA,
        onCommit: onCommitLoteA,
      });
    });

    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote B arquivado',
        undoMessage: 'Arquivamento B desfeito',
        action: vi.fn().mockResolvedValue('B'),
        undoAction: undoLoteB,
        onCommit: vi.fn(),
      });
    });

    const avisoA = avisoDe('Lote A arquivado');
    expect(h.calls.map((c) => c.message)).toEqual(['Lote A arquivado', 'Lote B arquivado']);

    // O usuário clica no Desfazer do aviso ANTIGO, ainda visível na tela.
    await act(async () => {
      await desfazerDe('Lote A arquivado').onClick();
    });

    // O clique pertence ao lote A: não pode reverter o lote B...
    expect(undoLoteB).not.toHaveBeenCalled();
    // ...e o undo do lote A já foi encerrado quando o lote B começou.
    expect(undoLoteA).not.toHaveBeenCalled();
    // O encerramento explícito do undo anterior: aviso dispensado e lote A commitado.
    expect(h.dismiss).toHaveBeenCalledWith(avisoA.id);
    expect(onCommitLoteA).toHaveBeenCalledTimes(1);
    // O aviso do lote B continua sendo o dono do undo.
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await desfazerDe('Lote B arquivado').onClick();
    });
    expect(undoLoteB).toHaveBeenCalledTimes(1);
    expect(undoLoteA).not.toHaveBeenCalled();
  });

  it('desfazer no aviso do lote atual desfaz a própria operação e limpa o estado', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const undoLoteA = vi.fn().mockResolvedValue(undefined);
    const undoLoteB = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote A arquivado',
        action: vi.fn().mockResolvedValue('A'),
        undoAction: undoLoteA,
      });
    });
    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote B arquivado',
        action: vi.fn().mockResolvedValue('B'),
        undoAction: undoLoteB,
      });
    });

    await act(async () => {
      await desfazerDe('Lote B arquivado').onClick();
    });

    expect(undoLoteB).toHaveBeenCalledTimes(1);
    expect(undoLoteA).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.timeRemaining).toBe(0);
  });

  it('o prazo de undo commita a operação pendente (sem regressão)', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const onCommit = vi.fn();

    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote único arquivado',
        action: vi.fn().mockResolvedValue('unico'),
        undoAction: vi.fn().mockResolvedValue(undefined),
        onCommit,
        undoDuration: 5000,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it('falha da ação limpa o estado e não deixa undo pendente', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const undo = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await expect(
        result.current.execute({
          successMessage: 'Lote que falha',
          action: vi.fn().mockRejectedValue(new Error('falha ao arquivar')),
          undoAction: undo,
        }),
      ).rejects.toThrow('falha ao arquivar');
    });

    // Nada de aviso de sucesso nem de undo por uma operação que não aconteceu.
    expect(undo).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.timeRemaining).toBe(0);

    // Sem operação pendente, cancelar não desfaz nada.
    await act(async () => {
      await result.current.cancelPendingAction();
    });
    expect(undo).not.toHaveBeenCalled();
  });

  it('cancelPendingAction desfaz a operação pendente e limpa o estado (sem regressão)', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const undo = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.execute({
        successMessage: 'Lote C arquivado',
        action: vi.fn().mockResolvedValue('C'),
        undoAction: undo,
      });
    });

    await act(async () => {
      await result.current.cancelPendingAction();
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.timeRemaining).toBe(0);
    expect(h.success).toHaveBeenCalledWith('Ação desfeita');
  });
});
