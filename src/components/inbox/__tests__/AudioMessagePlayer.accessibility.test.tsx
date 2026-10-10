import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn() })) })),
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
    circle: React.forwardRef((props: Record<string, unknown>, ref: unknown) => React.createElement('circle', { ref, ...props })),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

import '@/test/volumeControlMocks';

// Mock controlado pelo teste — redefinido em beforeEach
const mockUseAudioPlayer = vi.fn();
vi.mock('@/hooks/communication/useAudioPlayer', () => ({
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
}));

import { useAudioPlayer } from '@/hooks/communication/useAudioPlayer';
import { AudioMessagePlayer } from '../AudioMessagePlayer';

describe('AudioMessagePlayer — aria-label no botão de play/pause', () => {
  const defaultProps = {
    audioUrl: 'https://test.com/audio.webm',
    messageId: 'msg-1',
    isSent: false,
  };

  const defaultHookResult = {
    resolvedUrl: defaultProps.audioUrl,
    isPlaying: false,
    isLoading: false,
    hasError: false,
    progress: 0,
    waveformHeights: [0.3, 0.5, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5, 0.7, 0.4],
    duration: 10,
    currentTime: 0,
    playbackRate: 1,
    togglePlay: vi.fn(),
    handleSeek: vi.fn(),
    cycleSpeed: vi.fn(),
    formatTime: vi.fn(),
    resolveAudioUrl: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAudioPlayer.mockReturnValue(defaultHookResult);
  });

  it('botão de play tem aria-label "Tocar áudio" quando o áudio não está tocando', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Tocar áudio' })).toBeInTheDocument();
  });

  it('botão de play tem aria-label "Pausar áudio" quando o áudio está tocando', () => {
    mockUseAudioPlayer.mockReturnValue({
      ...defaultHookResult,
      isPlaying: true,
      progress: 50,
      currentTime: 5,
    });

    render(<AudioMessagePlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
  });

  it('aria-label alterna entre "Tocar áudio" e "Pausar áudio" conforme o estado de reprodução', () => {
    const { rerender } = render(<AudioMessagePlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Tocar áudio' })).toBeInTheDocument();

    mockUseAudioPlayer.mockReturnValue({
      ...defaultHookResult,
      isPlaying: true,
      progress: 50,
      currentTime: 5,
    });
    rerender(<AudioMessagePlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
  });
});