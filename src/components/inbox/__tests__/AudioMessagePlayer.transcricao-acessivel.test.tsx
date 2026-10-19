/**
 * L7 — transcrição do áudio chega ao leitor de tela.
 *
 * Antes: o selo "Falhou - Tentar novamente" era `<motion.div onClick>` (sem role,
 * sem teclado) e os selos de processando/transcrito não anunciavam nada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('@/hooks/communication/useAudioPlayer', () => ({
  useAudioPlayer: ({ audioUrl }: { audioUrl: string }) => ({
    audioRef: { current: null },
    resolvedUrl: audioUrl,
    isPlaying: false,
    isLoading: false,
    hasError: false,
    playbackRate: 1,
    progress: 0,
    waveformHeights: [],
    currentTime: 0,
    duration: 0,
    togglePlay: vi.fn(),
    handleSeek: vi.fn(),
    cycleSpeed: vi.fn(),
    formatTime: () => '0:00',
    resolveAudioUrl: vi.fn().mockResolvedValue(audioUrl),
  }),
}));

vi.mock('@/components/inbox/MediaVolumeControl', () => ({ MediaVolumeControl: () => null }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })} , getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }), createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/realtimeTopic', () => ({ uniqueRealtimeTopic: (base: string) => `${base}:teste` }));

import { AudioMessagePlayer } from '../AudioMessagePlayer';

const renderPlayer = (extra: { existingTranscription?: string | null; transcriptionStatus?: string | null } = {}) => render(
  <AudioMessagePlayer
    audioUrl="https://cdn.test/audio.webm"
    messageId="msg-1"
    isSent={false}
    {...extra}
  />,
);

describe('L7 — selo de transcrição com falha é botão de verdade', () => {
  it('o selo "Falhou - Tentar novamente" é um button com nome acessível', () => {
    renderPlayer({ transcriptionStatus: 'failed' });

    const tentar = screen.getByRole('button', { name: 'Tentar transcrever novamente' });
    expect(tentar).toHaveTextContent('Falhou - Tentar novamente');
    expect(tentar.tagName).toBe('BUTTON');
  });
});

describe('L7 — selos de progresso são anúncio (role=status)', () => {
  it('transcrevendo é anunciado como status', () => {
    renderPlayer({ transcriptionStatus: 'processing' });

    expect(screen.getByRole('status')).toHaveTextContent('Transcrevendo...');
  });

  it('transcrito é anunciado como status', () => {
    renderPlayer({ existingTranscription: 'Oi, tudo bem?', transcriptionStatus: 'completed' });

    expect(screen.getByRole('status')).toHaveTextContent('Transcrito');
  });
});

describe('L7 — botão de transcrição expõe o estado do painel', () => {
  it('aria-expanded acompanha a exibição da transcrição', () => {
    renderPlayer({ existingTranscription: 'Oi, tudo bem?', transcriptionStatus: 'completed' });

    const botao = screen.getByRole('button', { name: 'Mostrar/ocultar transcrição' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'false');
  });

  it('sem transcrição o botão se chama "Transcrever áudio"', () => {
    renderPlayer({ transcriptionStatus: 'pending' });

    expect(screen.getByRole('button', { name: 'Transcrever áudio' })).not.toHaveAttribute('aria-expanded');
  });
});
