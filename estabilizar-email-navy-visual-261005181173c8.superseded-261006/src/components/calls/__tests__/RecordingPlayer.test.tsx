import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordingPlayer } from '../RecordingPlayer';
import {
  DEFAULT_MEDIA_VOLUME_STATE,
  setMuted,
  setVolume,
  toGain,
} from '@/lib/mediaVolumeStore';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

const renderPlayer = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const audioDoPlayer = (container: HTMLElement) => container.querySelector('audio') as HTMLAudioElement;

describe('RecordingPlayer (T67)', () => {
  beforeEach(() => invoke.mockReset().mockResolvedValue({ data: { url: 'https://exemplo/g.mp3' }, error: null }));

  it('nao renderiza nada quando a chamada nao tem gravacao', () => {
    renderPlayer(<RecordingPlayer callId="c1" recordingStatus="none" />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
  });

  it('nao renderiza nem requisita quando a chamada nao diz que tem', () => {
    renderPlayer(<RecordingPlayer callId="c2" recordingStatus={null} />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('com gravacao disponivel o player existe e pede o audio pela Edge (nunca pela URL)', async () => {
    renderPlayer(<RecordingPlayer callId="c3" recordingStatus="available" />);
    // D3 revisado em 29/09 (reconciliar com o Bitrix24): a Edge get-call-recording existe, entao
    // o player deixa de devolver null e passa a buscar o audio - sem que a URL chegue ao front.
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get-call-recording', expect.objectContaining({ body: { callId: 'c3' } })));
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('http');
  });
});

/**
 * VOL-02 (item 68) — ACTIVE_REGRESSION: o <audio> EFETIVO da gravacao nasce dentro de
 * RecordingPlayer, enquanto a ref/hook ficavam no shell (TelefoniaView). O contrato textual
 * ficava verde buscando o nome do hook no shell; o elemento real tocava no volume cheio e o
 * slider mentia. Estes testes provam o elemento, nao o shell.
 */
describe('RecordingPlayer (VOL-02) — a gravacao respeita o volume global', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({ data: { url: 'https://exemplo/g.mp3' }, error: null });
    act(() => {
      setVolume(DEFAULT_MEDIA_VOLUME_STATE.volume);
      setMuted(DEFAULT_MEDIA_VOLUME_STATE.muted);
    });
  });

  it('o <audio> efetivo nasce no volume global e acompanha ajustes e mute', async () => {
    act(() => setVolume(40));

    const { container } = renderPlayer(<RecordingPlayer callId="v1" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player');
    const audio = audioDoPlayer(container);
    expect(audio).not.toBeNull();

    // Ganho perceptual aplicado pelo controle unico: (40/100)^2 = 0.16.
    await waitFor(() => expect(audio.volume).toBeCloseTo(toGain(40), 5));
    expect(audio.muted).toBe(false);

    // Muda para 70 no controle global: o mesmo elemento acompanha.
    act(() => setVolume(70));
    expect(audio.volume).toBeCloseTo(toGain(70), 5);

    // Mute global chega ao elemento (a gravacao nao pode tocar com a midia muda).
    act(() => setMuted(true));
    expect(audio.muted).toBe(true);

    act(() => setMuted(false));
    expect(audio.muted).toBe(false);
  });

  it('ao desmontar, o player deixa de seguir o store (desliga o ganho)', async () => {
    act(() => setVolume(40));

    const { container, unmount } = renderPlayer(<RecordingPlayer callId="v2" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player');
    const audio = audioDoPlayer(container);
    await waitFor(() => expect(audio.volume).toBeCloseTo(toGain(40), 5));

    unmount();
    act(() => setVolume(5));

    // Sem a subscricao ativa, o elemento desmontado nao volta a receber ajustes.
    expect(audio.volume).toBeCloseTo(toGain(40), 5);
  });
});
