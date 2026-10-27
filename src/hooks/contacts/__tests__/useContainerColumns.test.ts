import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLUMNS_BREAKPOINTS,
  COLUMNS_STORAGE_KEY,
  clampColumnsPreference,
  readStoredColumnsPreference,
  resolveContainerColumns,
  storeColumnsPreference,
  useContainerColumns,
  type ColumnsPreference,
} from '@/hooks/contacts/useContainerColumns';

/**
 * RD-005 — colunas dos cards pela largura real do CONTÊINER.
 *
 * O que o cartão pede: o número de cards por linha acompanha a área (barra
 * lateral aberta ou fechada), não a janela. Aqui o `ResizeObserver` é simulado
 * e o contêiner é um elemento falso: medimos exatamente o que o `rect` devolve,
 * sem layout de navegador. Os 4 limites da regra do design (1200, 900, 560 e
 * abaixo de 560) são conferidos nos dois lados de cada fronteira.
 */

/** Contêiner falso: a largura do `rect` muda quando o teste pede. */
class Container {
  readonly element: HTMLDivElement;
  private largura: number;

  constructor(width: number) {
    this.largura = width;
    this.element = document.createElement('div');
    Object.defineProperty(this.element, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          width: this.largura,
          height: 0,
          top: 0,
          left: 0,
          right: this.largura,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    document.body.appendChild(this.element);
  }

  resize(width: number): void {
    this.largura = width;
  }
}

/** Notificações de redimensionamento registradas pelo hook. */
const observadores: (() => void)[] = [];
let desligamentos = 0;

class ResizeObserverStub {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe(): void {
    observadores.push(this.callback);
  }
  unobserve(): void {}
  disconnect(): void {
    desligamentos += 1;
  }
}

function refDe(container: Container) {
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement | null }).current = container.element;
  return ref;
}

/** Simula a resposta atrasada/observada do navegador a um novo tamanho. */
function redimensionar(container: Container, width: number): void {
  container.resize(width);
  act(() => {
    observadores.forEach((notificar) => notificar());
  });
}

beforeEach(() => {
  observadores.length = 0;
  desligamentos = 0;
  window.localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('resolveContainerColumns — regra do design nos 4 limites', () => {
  it('largura >= 1200 usa a preferência do usuário', () => {
    expect(resolveContainerColumns(COLUMNS_BREAKPOINTS.wide, 4)).toBe(4);
    expect(resolveContainerColumns(2000, 3)).toBe(3);
    expect(resolveContainerColumns(1200, 2)).toBe(2);
  });

  it('largura >= 900 nunca passa de 3, mesmo com preferência 4', () => {
    expect(resolveContainerColumns(COLUMNS_BREAKPOINTS.medium, 4)).toBe(3);
    expect(resolveContainerColumns(1199, 4)).toBe(3);
    expect(resolveContainerColumns(1000, 3)).toBe(3);
    expect(resolveContainerColumns(1000, 2)).toBe(2);
  });

  it('largura >= 560 devolve 2 (sem preferência que valha aqui)', () => {
    expect(resolveContainerColumns(COLUMNS_BREAKPOINTS.narrow, 4)).toBe(2);
    expect(resolveContainerColumns(899, 4)).toBe(2);
    expect(resolveContainerColumns(560, 2)).toBe(2);
  });

  it('abaixo de 560 devolve 1, inclusive sem medida', () => {
    expect(resolveContainerColumns(559, 4)).toBe(1);
    expect(resolveContainerColumns(0, 4)).toBe(1);
    expect(resolveContainerColumns(Number.NaN, 4)).toBe(1);
    expect(resolveContainerColumns(-10, 4)).toBe(1);
  });
});

describe('clampColumnsPreference', () => {
  it('mantém 2..4 e traz valores fora da faixa para o limite', () => {
    expect(clampColumnsPreference(3)).toBe(3);
    expect(clampColumnsPreference(1)).toBe(1);
    expect(clampColumnsPreference(9)).toBe(4);
    expect(clampColumnsPreference(Number.NaN)).toBe(2);
  });
});

describe('useContainerColumns — medida pelo contêiner', () => {
  it('mede o contêiner e devolve {columns, width}', () => {
    const ref = refDe(new Container(1280));
    const { result } = renderHook(() => useContainerColumns(ref, 4));
    expect(result.current.width).toBe(1280);
    expect(result.current.columns).toBe(4);
  });

  it('acompanha o redimensionamento do contêiner (barra lateral abrindo/fechando)', () => {
    const container = new Container(1280);
    const ref = refDe(container);
    const { result } = renderHook(() => useContainerColumns(ref, 4));
    expect(result.current.columns).toBe(4);

    redimensionar(container, 1000);
    expect(result.current.width).toBe(1000);
    expect(result.current.columns).toBe(3);

    redimensionar(container, 640);
    expect(result.current.columns).toBe(2);

    redimensionar(container, 480);
    expect(result.current.columns).toBe(1);
  });

  it('antes da primeira medida (sem elemento) vale a preferência do usuário', () => {
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useContainerColumns(ref, 3));
    expect(result.current.width).toBeNull();
    expect(result.current.columns).toBe(3);
  });

  it('a preferência é entrada: mudar ela reage sem nova medida', () => {
    const ref = refDe(new Container(1500));
    const { result, rerender } = renderHook(
      ({ p }: { p: ColumnsPreference }) => useContainerColumns(ref, p),
      { initialProps: { p: 4 as ColumnsPreference } },
    );
    expect(result.current.columns).toBe(4);

    rerender({ p: 2 });
    expect(result.current.columns).toBe(2);
  });

  it('desliga o observer no unmount', () => {
    const ref = refDe(new Container(1280));
    const { unmount } = renderHook(() => useContainerColumns(ref, 4));
    unmount();
    expect(desligamentos).toBe(1);
  });
});

describe('useContainerColumns — preferência persistida', () => {
  it('guarda a preferência no localStorage e a lê de volta', () => {
    const ref = refDe(new Container(1280));
    renderHook(() => useContainerColumns(ref, 3));
    expect(window.localStorage.getItem(COLUMNS_STORAGE_KEY)).toBe('3');
    expect(readStoredColumnsPreference()).toBe(3);
  });

  it('valor salvo inválido é ignorado na leitura', () => {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, 'nove');
    expect(readStoredColumnsPreference()).toBeNull();
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, '7');
    expect(readStoredColumnsPreference()).toBeNull();
  });

  it('sem localStorage (acesso lançando) a tela funciona igual', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('acesso bloqueado', 'SecurityError');
      },
    });

    try {
      const ref = refDe(new Container(1280));
      const { result } = renderHook(() => useContainerColumns(ref, 4));
      expect(result.current.width).toBe(1280);
      expect(result.current.columns).toBe(4);
      expect(readStoredColumnsPreference()).toBeNull();
      expect(() => storeColumnsPreference(3)).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
