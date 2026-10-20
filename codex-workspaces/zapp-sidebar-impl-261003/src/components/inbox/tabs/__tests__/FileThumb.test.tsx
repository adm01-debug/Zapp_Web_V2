import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FileThumb } from '../FileThumb';
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

function base(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'x', url: 'https://x/file.bin', type: 'image', filename: 'file.bin', displayName: 'file.bin',
    extension: null, senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null,
    mimetype: null, size: null, meta: null, sender: 'contact', signedUrl: undefined, ...overrides,
  };
}

function setResolved(state: Partial<ResolvedUrlState> = {}) {
  hooks.current = { url: '', isLoading: false, error: null, refresh: vi.fn().mockResolvedValue(null), ...state };
}

beforeEach(() => setResolved());

describe('FileThumb (etapa 26)', () => {
  it('loading: mostra skeleton enquanto a URL assinada resolve', () => {
    setResolved({ isLoading: true, url: '' });
    const { container } = render(<FileThumb item={base({ signedUrl: undefined })} size="row" />);
    expect(screen.getByTestId('files-thumb-skeleton')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('ready: imagem do cartão usa object-contain; miniatura usa object-cover', () => {
    const item = base({ signedUrl: 'https://signed.test/planilha.png' });
    const card = render(<FileThumb item={item} size="card" />);
    expect(card.container.querySelector('img')?.className).toContain('object-contain');
    card.unmount();

    const row = render(<FileThumb item={item} size="row" />);
    expect(row.container.querySelector('img')?.className).toContain('object-cover');
  });

  it('erro: exatamente 1 refresh automático e depois placeholder estável', async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    setResolved({ refresh, url: 'https://broken.test/x.png' });
    const { container } = render(
      <FileThumb item={base({ signedUrl: undefined, url: 'https://broken.test/x.png' })} size="row" />,
    );

    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    fireEvent.error(img);

    await screen.findByTitle('Prévia indisponível');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')).toBeNull();
  });

  it('erro: depois do refresh bem-sucedido a imagem volta', async () => {
    const refresh = vi.fn().mockResolvedValue('https://fresh.test/x.png');
    setResolved({ refresh, url: 'https://broken.test/x.png' });
    const item = base({ signedUrl: undefined, url: 'https://broken.test/x.png' });
    const { container, rerender } = render(<FileThumb item={item} size="row" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(refresh).toHaveBeenCalledTimes(1);

    setResolved({ url: 'https://fresh.test/x.png' });
    rerender(<FileThumb item={item} size="row" />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://fresh.test/x.png');
    expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
  });

  it('no-preview: imagem sem URL cai no ícone do tipo, sem título de erro', () => {
    setResolved({ isLoading: false, url: '' });
    const { container } = render(<FileThumb item={base({ url: '', signedUrl: undefined })} size="row" />);
    expect(container.querySelector('.lucide-image')).not.toBeNull();
    expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
  });
});

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

const VIDEO = () => base({ type: 'video', signedUrl: 'https://signed.test/v.mp4' });

describe('FileThumb (etapa 27 — vídeo sem pôster inventado)', () => {
  it('só monta <video> dentro da zona de pré-carregamento (rootMargin 200px)', () => {
    const { container } = withFiringObserver(() => {
      const result = render(<FileThumb item={base({ ...VIDEO(), meta: { thumbnail: 'https://x/poster.jpg' } })} size="card" />);
      expect(result.container.querySelector('video')).toBeNull();
      enterPreloadZone();
      return result;
    });

    expect(FiringIntersectionObserver.lastOptions?.rootMargin).toBe('200px');
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute('playsinline');
    expect(video.muted).toBe(true);
    // G14: nenhum pôster derivado de media_meta.
    expect(video.getAttribute('poster')).toBeNull();
    expect(container.querySelector('.lucide-play')).not.toBeNull();
  });

  it('fora da zona: ícone de vídeo + rótulo, nunca <video>', () => {
    withFiringObserver(() => {
      const { container } = render(<FileThumb item={VIDEO()} size="card" />);
      expect(container.querySelector('video')).toBeNull();
      expect(screen.getByText('Vídeo')).toBeInTheDocument();
      expect(container.querySelector('.lucide-play')).not.toBeNull();
    });
  });

  it('duração vem do loadedmetadata do próprio <video>', async () => {
    const { container } = withFiringObserver(() => {
      const result = render(<FileThumb item={VIDEO()} size="card" />);
      enterPreloadZone();
      return result;
    });
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 75, configurable: true });
    fireEvent.loadedMetadata(video);
    expect(await screen.findByText('1:15')).toBeInTheDocument();
  });
});

describe('FileThumb (etapa 28 — áudio compacto)', () => {
  it('mostra AudioLines + rótulo "Áudio" e não inventa duração com meta nulo', () => {
    const { container } = render(<FileThumb item={base({ type: 'audio', meta: null, signedUrl: 'https://signed.test/a.ogg' })} size="card" />);
    expect(screen.getByText('Áudio')).toBeInTheDocument();
    expect(container.querySelector('.lucide-audio-lines')).not.toBeNull();
    expect(screen.queryByText(/\d+:\d{2}/)).not.toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();
  });

  it('áudio e vídeo se distinguem pelo ícone, não pela cor', () => {
    const audio = render(<FileThumb item={base({ type: 'audio', signedUrl: 'https://signed.test/a.ogg' })} size="card" />);
    expect(audio.container.querySelector('.lucide-audio-lines')).not.toBeNull();
    expect(audio.container.querySelector('.lucide-play')).toBeNull();
    audio.unmount();

    const video = withFiringObserver(() => render(<FileThumb item={VIDEO()} size="card" />));
    expect(video.container.querySelector('.lucide-play')).not.toBeNull();
    expect(video.container.querySelector('.lucide-audio-lines')).toBeNull();
  });
});

describe('FileThumb (etapa 29 — documento por extensão)', () => {
  it.each([
    ['contrato.pdf', 'pdf', 'PDF', '.lucide-file-text'],
    ['planilha.xlsx', 'xlsx', 'XLSX', '.lucide-file-spreadsheet'],
    ['relatorio.docx', 'docx', 'DOCX', '.lucide-file-text'],
    ['deck.pptx', 'pptx', 'PPTX', '.lucide-presentation'],
    ['pacote.zip', 'zip', 'ZIP', '.lucide-file-archive'],
  ])('%s → ícone da família + Badge %s', (filename, extension, badge, iconSelector) => {
    const { container } = render(
      <FileThumb item={base({ type: 'document', filename, extension, signedUrl: 'https://signed.test/f' })} size="card" />,
    );
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(container.querySelector(iconSelector)).not.toBeNull();
    // Sem miniatura de conteúdo no cartão de documento.
    expect(container.querySelector('img')).toBeNull();
  });

  it('extensão desconhecida → ícone genérico e nenhum Badge', () => {
    const { container } = render(
      <FileThumb item={base({ type: 'document', filename: 'misterio.xyz', extension: 'xyz' })} size="card" />,
    );
    expect(container.querySelector('.lucide-file')).not.toBeNull();
    expect(screen.queryByText('XYZ')).not.toBeInTheDocument();
  });
});
