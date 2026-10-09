/**
 * Comportamento do store de toasts (`src/hooks/ui/use-toast.ts`). Estado de módulo:
 * cada teste monta o próprio hook e o `beforeEach` esvazia a fila com timers falsos.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reducer, toast, useToast } from '../use-toast';

const ATRASO_REMOCAO = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useToast());
  act(() => {
    result.current.dismiss();
  });
  act(() => {
    vi.advanceTimersByTime(ATRASO_REMOCAO + 1);
  });
  unmount();
});

describe('toast() + useToast()', () => {
  it('registra o toast e o hook o enxerga aberto', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: 'Mensagem enviada' });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('Mensagem enviada');
    expect(result.current.toasts[0].open).toBe(true);
  });

  it('devolve um id por chamada (não reaproveita id)', () => {
    const primeiro = toast({ title: 'um' });
    const segundo = toast({ title: 'dois' });
    expect(primeiro.id).not.toBe(segundo.id);
  });

  it('respeita o limite de um toast na tela: o novo substitui o antigo', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: 'primeiro' });
    });
    act(() => {
      toast({ title: 'segundo' });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('segundo');
  });

  it('avisa todos os hooks montados (subscribe/notify)', () => {
    const um = renderHook(() => useToast());
    const dois = renderHook(() => useToast());
    act(() => {
      toast({ title: 'para os dois' });
    });
    expect(um.result.current.toasts[0].title).toBe('para os dois');
    expect(dois.result.current.toasts[0].title).toBe('para os dois');
  });

  it('deixa de avisar depois do unmount', () => {
    const desmontado = renderHook(() => useToast());
    const montado = renderHook(() => useToast());
    let handle: { dismiss: () => void } | null = null;
    act(() => {
      handle = toast({ title: 'antes do unmount' });
    });
    expect(desmontado.result.current.toasts[0].open).toBe(true);
    expect(montado.result.current.toasts[0].open).toBe(true);

    desmontado.unmount();
    act(() => {
      handle?.dismiss();
    });

    expect(desmontado.result.current.toasts[0].open).toBe(true);
    expect(montado.result.current.toasts[0].open).toBe(false);
  });
});

describe('update / dismiss', () => {
  it('update troca só os campos informados, mantendo o id', () => {
    const { result } = renderHook(() => useToast());
    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: 'novo', description: 'aguarde' });
    });
    act(() => {
      handle.update({ id: handle.id, title: 'atualizado' });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(handle.id);
    expect(result.current.toasts[0].title).toBe('atualizado');
    expect(result.current.toasts[0].description).toBe('aguarde');
  });

  it('dismiss(id) fecha o toast correspondente e ignora outro id', () => {
    const { result } = renderHook(() => useToast());
    let handle: { id: string; dismiss: () => void } | null = null;
    act(() => {
      handle = toast({ title: 'fechando' });
    });
    act(() => {
      result.current.dismiss('outro-id');
    });
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      handle?.dismiss();
    });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('dismiss() sem id fecha todos (usado no reset da tela)', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: 'um' });
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('onOpenChange(false) fecha o toast (é o que o Radix chama)', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: 'clicável' });
    });
    act(() => {
      result.current.toasts[0].onOpenChange?.(false);
    });
    expect(result.current.toasts[0].open).toBe(false);
  });
});

describe('reducer', () => {
  // `REMOVE_TOAST` sem id só é alcançável pelo reducer (o store sempre manda o
  // id): é o caminho que esvazia a fila de uma vez.
  type Acao = Parameters<typeof reducer>[1];

  it('REMOVE_TOAST com id tira só aquele toast', () => {
    const estado = reducer(
      { toasts: [{ id: 'a', open: false }, { id: 'b', open: false }] as never },
      { type: 'REMOVE_TOAST', toastId: 'a' } as unknown as Acao,
    );
    expect(estado.toasts.map((t) => t.id)).toEqual(['b']);
  });

  it('REMOVE_TOAST sem id esvazia a lista inteira', () => {
    const estado = reducer(
      { toasts: [{ id: 'a', open: false }, { id: 'b', open: false }] as never },
      { type: 'REMOVE_TOAST' } as unknown as Acao,
    );
    expect(estado.toasts).toEqual([]);
  });
});

describe('remoção da fila', () => {
  it('remove o toast da lista só depois do atraso de remoção', () => {
    const { result } = renderHook(() => useToast());
    let handle: { id: string; dismiss: () => void } | null = null;
    act(() => {
      handle = toast({ title: 'temporário' });
    });
    act(() => {
      handle?.dismiss();
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(ATRASO_REMOCAO - 1);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('fechar duas vezes não deixa o toast preso na lista', () => {
    const { result } = renderHook(() => useToast());
    let handle: { id: string; dismiss: () => void } | null = null;
    act(() => {
      handle = toast({ title: 'duas vezes' });
    });
    act(() => {
      handle?.dismiss();
      handle?.dismiss();
    });
    act(() => {
      vi.advanceTimersByTime(ATRASO_REMOCAO);
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
