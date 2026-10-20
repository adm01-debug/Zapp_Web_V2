import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
    img: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('img', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({ gain: 0.64, muted: false }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  detectVideoAudioTrack: () => true,
}));

vi.mock('../MediaVolumeControl', () => ({
  MediaVolumeControl: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipTrigger: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipContent: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
}));

import { ImagePreview } from '@/components/inbox/ImagePreview';
import { VideoFullscreen } from '@/components/inbox/VideoFullscreen';

describe('ImagePreview — aria-labels nos botões', () => {
  beforeEach(() => vi.clearAllMocks());

  it('botão de zoom tem aria-label "Ampliar" no estado inicial', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);
    expect(screen.getByRole('button', { name: /ampliar/i })).toBeInTheDocument();
  });

  it('botão de download tem aria-label "Baixar"', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);
    expect(screen.getByRole('button', { name: /baixar/i })).toBeInTheDocument();
  });

  it('botão de fechar tem aria-label "Fechar"', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);
    expect(screen.getByRole('button', { name: /fechar/i })).toBeInTheDocument();
  });
});

describe('VideoFullscreen — aria-labels nos botões', () => {
  beforeEach(() => vi.clearAllMocks());

  it('botão de download tem aria-label "Baixar"', () => {
    render(<VideoFullscreen url="https://example.com/video.mp4" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /baixar/i })).toBeInTheDocument();
  });

  it('botão de fechar tem aria-label "Fechar"', () => {
    render(<VideoFullscreen url="https://example.com/video.mp4" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /fechar/i })).toBeInTheDocument();
  });

  it('axe button-name zerado no ImagePreview e no VideoFullscreen', async () => {
    const { container: previewContainer } = render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);
    const previewResults = await axe(previewContainer, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(previewResults).toHaveNoViolations();

    const { container: videoContainer } = render(<VideoFullscreen url="https://example.com/video.mp4" onClose={() => {}} />);
    const videoResults = await axe(videoContainer, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(videoResults).toHaveNoViolations();
  });
});