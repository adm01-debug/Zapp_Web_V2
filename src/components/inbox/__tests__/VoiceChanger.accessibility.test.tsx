import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { VoiceChanger } from '../VoiceChanger';

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (v: boolean) => void }) => {
    popoverState.onOpenChange = onOpenChange;
    return <>{children}</>;
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    button: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('button', { ...props, ref }),
    ),
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('div', { ...props, ref }),
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    storage: { from: vi.fn() },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer mock-token' }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('../VoiceSelector', () => ({
  ELEVENLABS_VOICES: [
    { id: 'voice-1', name: 'Voz Principal', gender: 'female', description: 'Voz principal' },
  ],
}));

const mockAudioBlob = new Blob(['mock-audio'], { type: 'audio/webm' });
const mockConvertedBlob = new Blob(['mock-converted-audio'], { type: 'audio/webm' });

beforeEach(() => {
  vi.restoreAllMocks();
  popoverState.onOpenChange = undefined;
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
    ok: true,
    blob: vi.fn().mockResolvedValue(mockConvertedBlob),
  })));
  const mockPlay = vi.fn().mockResolvedValue(undefined);
  const mockPause = vi.fn();
  vi.stubGlobal('Audio', class {
    src = '';
    play = mockPlay;
    pause = mockPause;
    constructor(_src?: string) {
      if (_src) this.src = _src;
    }
  } as unknown as typeof window.Audio);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const mockOnVoiceChanged = vi.fn();

describe('VoiceChanger — acessibilidade', () => {
  it('botão de reprodução tem aria-label "Pausar áudio" quando o áudio está tocando (auto-play após conversão)', async () => {
    render(
      <VoiceChanger
        audioBlob={mockAudioBlob}
        onVoiceChanged={mockOnVoiceChanged}
        disabled={false}
      />
    );

    act(() => {
      popoverState.onOpenChange?.(true);
    });

    const voiceButton = screen.getByRole('button', { name: /Voz Principal/ });
    await act(async () => {
      fireEvent.click(voiceButton);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
    });
  });

  it('botão de reprodução tem aria-label "Tocar áudio" quando o áudio está pausado', async () => {
    render(
      <VoiceChanger
        audioBlob={mockAudioBlob}
        onVoiceChanged={mockOnVoiceChanged}
        disabled={false}
      />
    );

    act(() => {
      popoverState.onOpenChange?.(true);
    });

    const voiceButton = screen.getByRole('button', { name: /Voz Principal/ });
    await act(async () => {
      fireEvent.click(voiceButton);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
    });

    const pauseButton = screen.getByRole('button', { name: 'Pausar áudio' });
    await act(async () => {
      fireEvent.click(pauseButton);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tocar áudio' })).toBeInTheDocument();
    });
  });
});