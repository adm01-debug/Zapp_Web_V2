import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

const hv = vi.hoisted(() => ({
  hook: {} as Record<string, unknown>,
  opcoes: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/communication/useAudioRecorder', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/communication/useAudioRecorder');
  return {
    ...actual,
    useAudioRecorder: (opcoes: Record<string, unknown>) => {
      hv.opcoes = opcoes;
      return hv.hook;
    },
  };
});

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => {},
}));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/inbox/VoiceChanger', () => ({
  VoiceChanger: () => <div data-testid="voice-changer" />,
}));

import { AudioRecorder } from '../AudioRecorder';

function baseHook(overrides: Record<string, unknown> = {}) {
  hv.hook = {
    isRecording: false,
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
    uploadAudio: vi.fn(),
    formatDuration: (s: number) => `0:0${s}`,
    ...overrides,
  };
}

describe('AudioRecorder — pausa, descarte desfazível e gravação recuperada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseHook();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pausa e retoma pelo botão, anunciando o estado para leitor de tela', () => {
    baseHook({ isRecording: true, isPaused: false });
    const { getByLabelText, getByRole, rerender } = render(
      <AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(getByRole('status').textContent).toContain('Gravando.');
    fireEvent.click(getByLabelText('Pausar gravação'));
    expect(hv.hook.pauseRecording).toHaveBeenCalledTimes(1);

    baseHook({ isRecording: true, isPaused: true });
    rerender(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(getByRole('status').textContent).toContain('Gravação pausada.');
    fireEvent.click(getByLabelText('Retomar gravação'));
    expect(hv.hook.resumeRecording).toHaveBeenCalledTimes(1);
  });

  it('espaço pausa e retoma a gravação; escape descarta', () => {
    baseHook({ isRecording: true, isPaused: false });
    const { rerender } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(hv.hook.pauseRecording).toHaveBeenCalledTimes(1);

    baseHook({ isRecording: true, isPaused: true });
    rerender(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(hv.hook.resumeRecording).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(hv.hook.cancelRecording).toHaveBeenCalledTimes(1);
  });

  it('descarte aparece com a contagem e o desfazer devolve a gravação', () => {
    baseHook({
      discardedDraft: { userId: 'u1', blob: new Blob(['x']), createdAt: Date.now() },
      discardSecondsLeft: 4,
    });
    const { getByRole, getByLabelText } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(getByRole('status').textContent).toContain('Desfazer disponível por 4 segundos');
    const desfazer = getByLabelText('Desfazer descarte da gravação');
    expect(desfazer.textContent).toContain('Desfazer (4s)');

    fireEvent.click(desfazer);
    expect(hv.hook.undoDiscard).toHaveBeenCalledTimes(1);
  });

  it('não abre o microfone quando há gravação recuperada e oferece usá-la', () => {
    baseHook({
      recoveredDraft: { userId: 'u1', blob: new Blob(['orfao']), createdAt: Date.now() },
    });
    const { getByText, getByRole } = render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);

    expect(hv.hook.startRecording).not.toHaveBeenCalled();
    expect(getByRole('status')).toBeTruthy();

    fireEvent.click(getByText('Usar gravação'));
    expect(hv.hook.acceptRecoveredDraft).toHaveBeenCalledTimes(1);
  });

  it('gravação recuperada expirada (sem oferta) começa a gravar normalmente', () => {
    baseHook({ draftChecked: true, recoveredDraft: null });
    render(<AudioRecorder onSend={vi.fn()} onCancel={vi.fn()} />);
    expect(hv.hook.startRecording).toHaveBeenCalledTimes(1);
  });

  it('envio que falha nas 3 tentativas mantém a gravação e pede nova tentativa', async () => {
    vi.useFakeTimers();
    const onSend = vi.fn().mockRejectedValue(new Error('rede'));
    baseHook({ isRecording: false, audioUrl: 'blob:gravado' });
    const { getByLabelText, rerender } = render(<AudioRecorder onSend={onSend} onCancel={vi.fn()} />);

    // O hook real entrega o blob gravado por este callback.
    act(() => {
      (hv.opcoes.onRecordingComplete as (blob: Blob, url: string) => void)(new Blob(['audio']), 'blob:gravado');
    });
    rerender(<AudioRecorder onSend={onSend} onCancel={vi.fn()} />);

    fireEvent.click(getByLabelText('Enviar áudio'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onSend).toHaveBeenCalledTimes(3);
    expect(getByLabelText('Tentar enviar o áudio novamente')).toBeTruthy();
  });

  it('envio confirmado limpa o rascunho do disco', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    baseHook({ isRecording: false, audioUrl: 'blob:gravado' });
    const { getByLabelText, rerender } = render(<AudioRecorder onSend={onSend} onCancel={vi.fn()} />);

    act(() => {
      (hv.opcoes.onRecordingComplete as (blob: Blob, url: string) => void)(new Blob(['audio']), 'blob:gravado');
    });
    rerender(<AudioRecorder onSend={onSend} onCancel={vi.fn()} />);

    await act(async () => {
      fireEvent.click(getByLabelText('Enviar áudio'));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(hv.hook.clearDraft).toHaveBeenCalledTimes(1);
  });
});
