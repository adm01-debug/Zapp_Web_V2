import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({ muted: false }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  detectVideoAudioTrack: () => true,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...filterDomProps(props), ref }, children)),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => React.createElement('button', { ...props, ref }, children),
  ),
}));

vi.mock('@/components/inbox/MediaVolumeControl', () => ({
  MediaVolumeControl: () => React.createElement('div', { 'data-testid': 'volume-control' }, 'Volume'),
}));

import { VideoFullscreen } from '@/components/inbox/VideoFullscreen';

describe('VideoFullscreen — acessibilidade: nomes nos botões', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getByRole button encontra os 2 botões com nomes acessíveis (baixar, fechar)', () => {
    render(<VideoFullscreen url="https://example.com/video.mp4" onClose={vi.fn()} />);

    const buttons = screen.getAllByRole('button', { name: /ampliar|baixar|fechar/i });
    expect(buttons).toHaveLength(2);
  });

  it('botão de download tem aria-label "Baixar"', () => {
    render(<VideoFullscreen url="https://example.com/video.mp4" onClose={vi.fn()} />);

    const downloadBtn = screen.getByRole('button', { name: 'Baixar' });
    expect(downloadBtn).toBeInTheDocument();
  });

  it('botão de fechar tem aria-label "Fechar"', () => {
    const onClose = vi.fn();
    render(<VideoFullscreen url="https://example.com/video.mp4" onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Fechar' });
    expect(closeBtn).toBeInTheDocument();
  });
});