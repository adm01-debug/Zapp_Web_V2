import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import {
  CARD_GAP,
  MIN_CARD_WIDTH,
  columnsCapacity,
  effectiveColumns,
  useFilesContainerColumns,
} from '@/hooks/chat/useFilesContainerColumns';
import type { FilesColumns } from '@/hooks/chat/useFilesViewState';

/** Contêiner falso: medimos o que o rect devolve, sem layout real de navegador. */
function containerOf(width: number): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ width, height: 400, top: 0, left: 0, right: width, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(element);
  return element;
}

const observers: (() => void)[] = [];

class ResizeObserverStub {
  constructor(private callback: () => void) {}
  observe() { observers.push(this.callback); }
  unobserve() {}
  disconnect() {}
  trigger() { this.callback(); }
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('columnsCapacity', () => {
  it('usa (largura + gap) / (cartao + gap), com piso em 1', () => {
    expect(columnsCapacity(959)).toBe(5);
    expect(columnsCapacity(683)).toBe(3);
    expect(columnsCapacity(1474)).toBe(8);
    expect(columnsCapacity(0)).toBe(1);
    expect(columnsCapacity(-10)).toBe(1);
    expect(columnsCapacity(Number.NaN)).toBe(1);
    // fronteira: 3 cartoes cabem exatamente
    const exato = MIN_CARD_WIDTH * 3 + CARD_GAP * 2;
    expect(columnsCapacity(exato)).toBe(3);
    expect(columnsCapacity(exato - 1)).toBe(2);
  });
});

describe('effectiveColumns', () => {
  it('tabela do plano: larguras 683/959/1151/1282/1474 com preferencia 8 devolvem 3/5/6/6/8', () => {
    const larguras = [683, 959, 1151, 1282, 1474];
    const esperado = [3, 5, 6, 6, 8];
    larguras.forEach((largura, i) => {
      expect(effectiveColumns(columnsCapacity(largura), 8)).toBe(esperado[i]);
    });
  });

  it('capacidade 7 nao vira 7: a maior opcao valida e 6', () => {
    expect(columnsCapacity(1282)).toBe(7);
    expect(effectiveColumns(7, 8)).toBe(6);
  });

  it('preferencia menor que a capacidade manda: 4 colunas em 1474 px continua 4', () => {
    expect(effectiveColumns(columnsCapacity(1474), 4)).toBe(4);
  });

  it('abaixo de 3 colunas de capacidade, usa a propria capacidade (adaptacao automatica)', () => {
    expect(effectiveColumns(2, 8)).toBe(2);
    expect(effectiveColumns(1, 4)).toBe(1);
  });
});

describe('useFilesContainerColumns', () => {
  it('mede o contêiner e devolve effective/capacity/available', () => {
    const ref = createRef<HTMLDivElement>();
    const element = containerOf(959);
    (ref as { current: HTMLDivElement | null }).current = element;

    const { result } = renderHook(() => useFilesContainerColumns(ref, 4));
    expect(result.current.capacity).toBe(5);
    expect(result.current.effective).toBe(4); // preferencia 4 manda
    expect(result.current.available).toEqual([
      { n: 3, fits: true },
      { n: 4, fits: true },
      { n: 5, fits: true },
      { n: 6, fits: false },
      { n: 8, fits: false },
    ]);
  });

  it('nao altera a preferencia: ela e entrada, nao saida', () => {
    const ref = createRef<HTMLDivElement>();
    const element = containerOf(1200);
    (ref as { current: HTMLDivElement | null }).current = element;

    const { result, rerender } = renderHook(({ preferred }) => useFilesContainerColumns(ref, preferred), {
      initialProps: { preferred: 8 as FilesColumns },
    });
    expect(result.current.capacity).toBe(6);
    expect(result.current.effective).toBe(6); // limitado pela capacidade, nao muda o preferido

    rerender({ preferred: 3 });
    expect(result.current.effective).toBe(3);
  });

  it('antes da primeira medida respeita a preferencia e nao desabilita opcao nenhuma', () => {
    const ref = createRef<HTMLDivElement>(); // sem elemento: nada a medir
    const { result } = renderHook(() => useFilesContainerColumns(ref, 6));
    expect(result.current.capacity).toBeNull();
    expect(result.current.effective).toBe(6);
    expect(result.current.available.every((option) => option.fits)).toBe(true);
  });

  it('reage a redimensionamento do contêiner', () => {
    const ref = createRef<HTMLDivElement>();
    const element = containerOf(683);
    (ref as { current: HTMLDivElement | null }).current = element;

    const { result } = renderHook(() => useFilesContainerColumns(ref, 8));
    expect(result.current.effective).toBe(3);

    element.getBoundingClientRect = () => ({ width: 1474, height: 400, top: 0, left: 0, right: 1474, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    act(() => {
      document.body.dispatchEvent(new Event('noop'));
      observers.forEach((notify) => notify());
    });

    expect(result.current.capacity).toBe(8);
    expect(result.current.effective).toBe(8);
  });
});
