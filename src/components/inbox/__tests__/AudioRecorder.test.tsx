import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';

// Estado controlável do hook de gravação: os testes deste arquivo cobrem o
// travamento da gravação e o ciclo de vida das URLs de blob da voz trocada, que
// dependem de mudar `isRecording` e de entregar o blob gravado.
const recState = vi.hoisted(() => ({
  isRecording: true,
  audioUrl: null as string | null,
  onRecordingComplete: undefined as ((b: Blob) => void) | undefined,
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(),
}));

vi.mock('@/hooks/communication/useAudioRecorder', () => ({
  useAudioRecorder: (opts: { onRecordingComplete?: (b: Blob) => void }) => {
    recState.onRecordingComplete = opts.onRecordingComplete;
    return {
      isRecording: recState.isRecording,
      duration: 3,
      audioUrl: recState.audioUrl,
      startRecording: vi.fn(),
      stopRecording: recState.stopRecording,
      cancelRecording: recState.cancelRecording,
      formatDuration: (s: number) => `00:0${s}`,
    };
  },
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => {},
}));

// Só o callback importa: o picker real tem teste próprio.
vi.mock('../VoiceChanger', () => ({
  VoiceChanger: ({ onVoiceChanged }: { onVoiceChanged: (b: Blob) => void }) => (
    <button onClick={() => onVoiceChanged(new Blob(['voz'], { type: 'audio/webm' }))}>trocar-voz</button>
  ),
}));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => true }));

import { AudioRecorder } from '../AudioRecorder';

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

describe('AudioRecorder — waveform de gravacao', () => {
  beforeEach(() => {
    recState.isRecording = true;
    recState.audioUrl = null;
    recState.stopRecording.mockClear();
    recState.cancelRecording.mockClear();
    createObjectURL = vi.fn(() => 'blob:voz-trocada');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
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

  it('ao travar, mantém a gravação e desliga o arrastar-para-cancelar', () => {
    const onCancel = vi.fn();
    const { container } = render(<AudioRecorder onSend={vi.fn()} onCancel={onCancel} />);
    const raiz = container.firstChild as HTMLElement;

    // Destravado: deslizar mais de 100 px para a esquerda cancela.
    fireEvent.touchStart(raiz, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(raiz, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(raiz);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Trava: a gravação continua e o botão de parar segue disponível.
    fireEvent.click(screen.getByLabelText('Travar gravação'));
    expect(screen.getByRole('status')).toHaveTextContent('Gravação travada');
    expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument();

    // Travado: o mesmo gesto não cancela mais.
    fireEvent.touchStart(raiz, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(raiz, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(raiz);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ao parar, o travamento volta a falso', () => {
    render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Travar gravação'));
    expect(screen.getByRole('status')).toHaveTextContent('Gravação travada');

    fireEvent.click(screen.getByLabelText('Parar gravação'));

    expect(recState.stopRecording).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Travar gravação')).toBeInTheDocument();
  });

  it('revoga a URL de blob ao trocar de voz de novo e ao desmontar', () => {
    recState.isRecording = false;
    recState.audioUrl = 'blob:gravacao';
    const { unmount } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    // A gravação terminou e o blob chegou na tela.
    act(() => recState.onRecordingComplete?.(new Blob(['voz'], { type: 'audio/webm' })));
    expect(screen.getByText('trocar-voz')).toBeInTheDocument();

    fireEvent.click(screen.getByText('trocar-voz'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    // Segunda troca: a URL anterior não pode ficar viva.
    fireEvent.click(screen.getByText('trocar-voz'));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:voz-trocada');

    // Sair da tela revoga a última URL criada.
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
