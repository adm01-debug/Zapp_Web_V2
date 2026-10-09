import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FileThumb } from '../FileThumb';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * R05/S43–S44 — duração do áudio DENTRO da miniatura (decisão D10).
 *
 * O componente é o REAL; o que se troca é a fronteira de plataforma: o resolver da URL assinada
 * (o teste só precisa da URL como semente) e `Audio`, que no jsdom não lê metadado nenhum.
 */
const hooks = vi.hoisted(() => ({
  current: { url: '', isLoading: false, error: null, refresh: () => Promise.resolve(null) },
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => hooks.current,
}));

class FakeAudio {
  static created: FakeAudio[] = [];
  preload = '';
  src = '';
  duration = 0;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeAudio.created.push(this);
  }

  setAttribute(name: string, value: string) {
    if (name === 'src') this.src = value;
  }

  /** O navegador respondeu os metadados: duração disponível, áudio NÃO baixado. */
  loadMetadata(seconds: number) {
    this.duration = seconds;
    this.onloadedmetadata?.();
  }

  /** URL expirada/ilegível: é assim que o elemento avisa. */
  fail() {
    this.onerror?.();
  }
}

vi.stubGlobal('Audio', FakeAudio);

function audioItem(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'a1', url: 'https://locator.test/a.ogg', type: 'audio', filename: 'recado.ogg',
    displayName: 'recado.ogg', extension: 'ogg', senderLabel: null,
    created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'audio/ogg', size: null,
    meta: null, sender: 'contact', signedUrl: 'https://signed.test/a.ogg', ...overrides,
  };
}

/** Stub que dispara o callback sob demanda — o mock global do setup não dispara. */
class FiringIntersectionObserver {
  static lastCallback: IntersectionObserverCallback | undefined;
  constructor(callback: IntersectionObserverCallback) {
    FiringIntersectionObserver.lastCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function withFiringObserver<T>(run: () => T): T {
  const original = window.IntersectionObserver;
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true, configurable: true, value: FiringIntersectionObserver,
  });
  FiringIntersectionObserver.lastCallback = undefined;
  try {
    return run();
  } finally {
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true, configurable: true, value: original,
    });
  }
}

/** Monta o cartão e — opcionalmente — entra na zona de pré-carregamento (o cartão apareceu). */
function renderCard(item: ContactMediaItem, entrarNaZona = true) {
  return withFiringObserver(() => {
    const result = render(<FileThumb item={item} size="card" />);
    if (entrarNaZona) {
      act(() => {
        FiringIntersectionObserver.lastCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    }
    return result;
  });
}

beforeEach(() => {
  FakeAudio.created = [];
});

describe('FileThumb — duração do áudio na miniatura (R05, D10)', () => {
  it('media_meta com duração: mostra a duração sem ler o arquivo (nenhum Audio criado)', () => {
    renderCard(audioItem({ meta: { duration: 15 } }));

    expect(screen.getByTestId('files-thumb-audio-duracao-a1')).toHaveTextContent('0:15');
    expect(FakeAudio.created).toHaveLength(0);
  });

  it('sem duração no media_meta: só lê quando o cartão aparece, e só os METADADOS', () => {
    const item = audioItem();
    // Fora da zona de pré-carregamento: nada de leitura (lista longa não lê áudio nenhum).
    const { rerender } = renderCard(item, false);
    expect(FakeAudio.created).toHaveLength(0);

    act(() => {
      FiringIntersectionObserver.lastCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    rerender(<FileThumb item={item} size="card" />);

    expect(FakeAudio.created).toHaveLength(1);
    expect(FakeAudio.created[0].preload).toBe('metadata');
    expect(FakeAudio.created[0].src).toBe('https://signed.test/a.ogg');

    // Chegaram os metadados: a duração aparece na miniatura.
    act(() => FakeAudio.created[0].loadMetadata(95));
    expect(screen.getByTestId('files-thumb-audio-duracao-a1')).toHaveTextContent('1:35');
  });

  it('carregando: mostra --:-- enquanto a leitura não volta', () => {
    renderCard(audioItem());

    const carregando = screen.getByTestId('files-thumb-audio-carregando-a1');
    expect(carregando).toHaveTextContent('--:--');
    expect(screen.queryByTestId('files-thumb-audio-duracao-a1')).not.toBeInTheDocument();
  });

  it('erro: mostra o estado de erro e não inventa duração', () => {
    renderCard(audioItem());

    act(() => FakeAudio.created[0].fail());

    expect(screen.getByTestId('files-thumb-audio-erro-a1')).toHaveAttribute(
      'title', 'Duração indisponível',
    );
    expect(screen.queryByTestId('files-thumb-audio-duracao-a1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-thumb-audio-carregando-a1')).not.toBeInTheDocument();
  });

  it('sem URL nenhuma: não lê nada e não promete duração', () => {
    renderCard(audioItem({ url: '', signedUrl: undefined }));

    expect(FakeAudio.created).toHaveLength(0);
    expect(screen.queryByTestId('files-thumb-audio-carregando-a1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-thumb-audio-duracao-a1')).not.toBeInTheDocument();
  });

  it('a leitura sob demanda não remonta a cada render (uma leitura por cartão)', () => {
    const item = audioItem();
    const { rerender } = renderCard(item);
    rerender(<FileThumb item={item} size="card" />);
    rerender(<FileThumb item={item} size="card" />);

    expect(FakeAudio.created).toHaveLength(1);
  });
});

describe('FileThumb — duração vinda de media_meta (D10)', () => {
  // Fora da zona de pré-carregamento: nenhuma leitura de arquivo acontece, então a duração na
  // tela só pode ter vindo do `media_meta`.
  it.each([
    [{ duration: 15 }, '0:15'],
    [{ duration: '15' }, '0:15'],
    [{ durationSeconds: 75 }, '1:15'],
    [{ duration_seconds: 120 }, '2:00'],
    [{ seconds: 3 }, '0:03'],
  ])('media_meta %o → %s, sem ler o arquivo', (meta, esperado) => {
    renderCard(audioItem({ meta: meta as Record<string, unknown> }), false);

    expect(screen.getByTestId('files-thumb-audio-duracao-a1')).toHaveTextContent(esperado);
    expect(FakeAudio.created).toHaveLength(0);
  });

  it.each([
    [{}], [{ duration: 0 }], [{ duration: -3 }], [{ duration: 'abc' }],
    [{ duration: null }], [{ outro: 42 }],
  ])('media_meta %o não inventa duração', (meta) => {
    renderCard(audioItem({ meta: meta as Record<string, unknown> }), false);

    expect(screen.queryByTestId('files-thumb-audio-duracao-a1')).not.toBeInTheDocument();
    expect(FakeAudio.created).toHaveLength(0);
  });
});
