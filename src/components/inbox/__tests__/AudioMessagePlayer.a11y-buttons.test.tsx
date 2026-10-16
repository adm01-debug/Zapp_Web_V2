import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { AudioMessagePlayer } from '../AudioMessagePlayer';

const state = vi.hoisted(() => ({ isPlaying: false, isLoading: false, hasError: false }));

vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn() },
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/components/inbox/MediaVolumeControl', () => ({ MediaVolumeControl: () => null }));

vi.mock('@/hooks/communication/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    audioRef: { current: null },
    resolvedUrl: 'blob:audio',
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    hasError: state.hasError,
    playbackRate: 1,
    progress: 0,
    waveformHeights: [4, 8, 6],
    currentTime: 0,
    duration: 0,
    togglePlay: vi.fn(),
    handleSeek: vi.fn(),
    cycleSpeed: vi.fn(),
    formatTime: () => '0:00',
    resolveAudioUrl: vi.fn(async () => 'blob:audio'),
  }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('framer-motion', () => {
  const passthrough =
    (tag: 'div' | 'button' | 'span') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), button: passthrough('button'), span: passthrough('span') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

describe('AudioMessagePlayer — botão de play com nome acessível (A11Y-13)', () => {
  beforeEach(() => {
    state.isPlaying = false;
    state.isLoading = false;
    state.hasError = false;
  });

  const renderPlayer = () =>
    render(<AudioMessagePlayer audioUrl="blob:audio" messageId="m1" isSent={false} />);

  it('nomeia "Reproduzir áudio" quando parado', () => {
    renderPlayer();
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });

  it('nomeia "Pausar áudio" enquanto toca', () => {
    state.isPlaying = true;
    renderPlayer();
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
  });

  it('nomeia "Reproduzir áudio novamente" em erro', () => {
    state.hasError = true;
    renderPlayer();
    expect(screen.getByRole('button', { name: 'Reproduzir áudio novamente' })).toBeInTheDocument();
  });

  it('nunca deixa o botão só de ícone sem nome', () => {
    renderPlayer();
    const botao = screen.getByRole('button', { name: 'Reproduzir áudio' });
    expect(botao).toHaveAccessibleName('Reproduzir áudio');
  });
});
