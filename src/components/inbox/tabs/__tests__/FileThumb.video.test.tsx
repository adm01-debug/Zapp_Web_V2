import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FileThumb, type FileThumbSize } from '../FileThumb';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

interface ResolvedUrlState {
  url: string;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<string | null>;
}

const hooks = vi.hoisted(() => ({ current: null as ResolvedUrlState | null }));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => hooks.current,
}));

beforeEach(() => {
  hooks.current = { url: '', isLoading: false, error: null, refresh: vi.fn().mockResolvedValue(null) };
});

const SIZES: FileThumbSize[] = ['card', 'row', 'cell'];

function videoItem(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'v1', url: 'https://locator.test/v.mp4', type: 'video', filename: 'clipe.mp4',
    displayName: 'clipe.mp4', extension: 'mp4', senderLabel: null,
    created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: null, size: null,
    meta: null, sender: 'contact', signedUrl: 'https://signed.test/v.mp4', ...overrides,
  };
}

/** Stub que dispara o callback sob demanda — o mock global do setup não dispara. */
class FiringIntersectionObserver {
  static lastCallback: IntersectionObserverCallback | undefined;
  static lastOptions: IntersectionObserverInit | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    FiringIntersectionObserver.lastCallback = callback;
    FiringIntersectionObserver.lastOptions = options;
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
  FiringIntersectionObserver.lastOptions = undefined;
  try {
    return run();
  } finally {
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true, configurable: true, value: original,
    });
  }
}

function enterPreloadZone() {
  act(() => {
    FiringIntersectionObserver.lastCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

function renderInsideZone(size: FileThumbSize, item = videoItem()) {
  return withFiringObserver(() => {
    const result = render(<FileThumb item={item} size={size} />);
    enterPreloadZone();
    return result;
  });
}

describe('M02 — miniatura de vídeo: primeiro quadro em todos os tamanhos', () => {
  it.each(SIZES)('%s: monta o <video> só dentro da zona e aponta para o primeiro quadro', (size) => {
    const { container } = withFiringObserver(() => {
      const result = render(<FileThumb item={videoItem()} size={size} />);
      // Fora da zona de pré-carregamento não existe `<video>` nenhum (lista longa).
      expect(result.container.querySelector('video')).toBeNull();
      enterPreloadZone();
      return result;
    });

    expect(FiringIntersectionObserver.lastOptions?.rootMargin).toBe('200px');
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    // `#t=0.1`: sem o deslocamento alguns navegadores não desenham o quadro de abertura.
    expect(video?.getAttribute('src')).toBe('https://signed.test/v.mp4#t=0.1');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute('playsinline');
    expect((video as HTMLVideoElement).muted).toBe(true);
    // G14: nenhum pôster derivado de `media_meta`.
    expect(video?.getAttribute('poster')).toBeNull();
    // O quadro ocupa a caixa nos três tamanhos.
    expect(video?.className).toContain('object-cover');
  });

  it.each(['row', 'cell'] as const)('%s: fora da zona de pré-carregamento fica o ícone de play', (size) => {
    withFiringObserver(() => {
      const { container } = render(<FileThumb item={videoItem()} size={size} />);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('.lucide-play')).not.toBeNull();
    });
  });

  it.each(['card', 'row'] as const)('%s: selo de duração a partir do loadedmetadata do próprio <video>', async (size) => {
    const { container } = renderInsideZone(size);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 75, configurable: true });
    fireEvent.loadedMetadata(video);

    expect(await screen.findByText('1:15')).toBeInTheDocument();
  });

  it('cell: não mostra selo de duração mesmo com a duração conhecida', () => {
    const { container } = renderInsideZone('cell');
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 75, configurable: true });
    fireEvent.loadedMetadata(video);

    expect(screen.queryByText('1:15')).not.toBeInTheDocument();
  });

  it.each(SIZES)('%s: falha do <video> cai no ícone de play (fallback)', (size) => {
    const { container } = renderInsideZone(size);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();

    fireEvent.error(video);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.lucide-play')).not.toBeNull();
  });

  it('card: o quadro do vídeo mantém o botão de play de prévia (etapa 27) e o rótulo do tipo fora da zona', () => {
    const { container } = renderInsideZone('card');
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('.lucide-play')).not.toBeNull();

    withFiringObserver(() => {
      const out = render(<FileThumb item={videoItem({ id: 'v2' })} size="card" />);
      expect(out.container.querySelector('video')).toBeNull();
      expect(screen.getByText('Vídeo')).toBeInTheDocument();
      expect(out.container.querySelector('.lucide-play')).not.toBeNull();
    });
  });

  it('vídeo sem URL nenhuma cai no ícone de play, sem montar <video>', () => {
    withFiringObserver(() => {
      const { container } = render(
        <FileThumb item={videoItem({ id: 'v3', url: '', signedUrl: undefined })} size="cell" />,
      );
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('.lucide-play')).not.toBeNull();
    });
  });
});
