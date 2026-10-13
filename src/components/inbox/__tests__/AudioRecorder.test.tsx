import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// A gravacao real (MediaRecorder) e o volume global nao fazem parte do que este teste pina.
vi.mock('@/hooks/communication/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: true,
    isPaused: false,
    duration: 3,
    audioUrl: null,
    draftChecked: true,
    recoveredDraft: null,
    discardedDraft: null,
    discardSecondsLeft: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    cancelRecording: vi.fn(),
    undoDiscard: vi.fn(),
    acceptRecoveredDraft: vi.fn(),
    dismissRecoveredDraft: vi.fn(),
    clearDraft: vi.fn(),
    getLevel: () => -1,
    formatDuration: (s: number) => `00:0${s}`,
  }),
  levelBufferToHeights: (levels: number[], bars: number, min = 4, max = 28) =>
    levels.length === 0 ? [] : Array.from({ length: bars }, () => min),
  sendWithBackoff: async (send: () => Promise<unknown>) => {
    try {
      await send();
      return true;
    } catch {
      return false;
    }
  },
}));
vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => {},
}));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));

import { AudioRecorder } from '../AudioRecorder';

describe('AudioRecorder — waveform de gravacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regressao do achado: `height: [4, Math.random() * 24 + 4, 4]` dentro do render violava
  // react-hooks/purity e ainda trocava as barras a cada re-render (o timer re-renderiza por segundo).
  it('nao chama funcao impura (Math.random) durante o render nem em re-render', () => {
    const random = vi.spyOn(Math, 'random');
    const { rerender } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(random).not.toHaveBeenCalled();

    rerender(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(random).not.toHaveBeenCalled();
  });

  it('desenha as 30 barras do waveform com alturas fixas', () => {
    const { container } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(container.querySelectorAll('.w-1').length).toBe(30);
  });
});
