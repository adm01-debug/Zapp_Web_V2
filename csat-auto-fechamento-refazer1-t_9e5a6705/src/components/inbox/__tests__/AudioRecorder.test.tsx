import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// A gravacao real (MediaRecorder) e o volume global nao fazem parte do que este teste pina.
vi.mock('@/hooks/communication/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: true,
    duration: 3,
    audioUrl: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    formatDuration: (s: number) => `00:0${s}`,
  }),
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
