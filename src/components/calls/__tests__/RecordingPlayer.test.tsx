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

/**
 * TEL-RECORDING-001 (item 62): a Edge `get-call-recording` responde o PROPRIO audio (stream),
 * nao um JSON com `{ url }`. O mock antigo devolvia `{ data: { url } }` de `functions.invoke` -
 * forma que a Edge nunca entrega - e por isso o player "passava" no teste e devolvia `null` em
 * producao. Agora o mock entrega bytes e o player tem de montar o <audio> a partir deles.
 */
vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn(async () => ({ apikey: 'anon', Authorization: 'Bearer token' })),
}));

const fetchMock = vi.fn();
const createObjectURL = vi.fn((_blob: Blob) => 'blob:audio-do-player');
const revokeObjectURL = vi.fn();

const audioDaEdge = () => new Blob(['bytes-de-audio-mp3'], { type: 'audio/mpeg' });

const renderPlayer = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const audioDoPlayer = (container: HTMLElement) => container.querySelector('audio') as HTMLAudioElement;

describe('RecordingPlayer (T67)', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });
    createObjectURL.mockReset().mockImplementation((_blob: Blob) => 'blob:audio-do-player');
    revokeObjectURL.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  });

  it('nao renderiza nada quando a chamada nao tem gravacao', () => {
    renderPlayer(<RecordingPlayer callId="c1" recordingStatus="none" />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
  });

  it('nao renderiza nem requisita quando a chamada nao diz que tem', () => {
    renderPlayer(<RecordingPlayer callId="c2" recordingStatus={null} />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // c3 e c4 sao dois cenarios independentes (um player por caso): juntar os dois no mesmo
  // `it` deixava o segundo player invisivel para o proprio teste - o container lido era o do
  // primeiro render, e o `screen` global via os dois.
  it('c3: com gravacao disponivel o player existe e busca o audio na Edge', async () => {
    const { container } = renderPlayer(<RecordingPlayer callId="c3" recordingStatus="available" />);

    // A Edge get-call-recording entrega o audio em bytes; o player monta o <audio> a partir
    // deles (blob local) sem que a URL do provedor chegue ao DOM.
    await screen.findByTestId('tel-recording-player');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/functions/v1/get-call-recording');

    const audio = audioDoPlayer(container);
    expect(audio).not.toBeNull();
    await waitFor(() => expect(audio.getAttribute('src')).toBe('blob:audio-do-player'));
  });

  it('c4: o <audio> e o link de download usam o blob local (nunca a URL de origem)', async () => {
    const { container } = renderPlayer(<RecordingPlayer callId="c4" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player');

    const audio = audioDoPlayer(container);
    await waitFor(() => expect(audio.getAttribute('src')).toBe('blob:audio-do-player'));

    // Nem o <audio> nem o link de download carregam a URL de origem (o blob e local).
    const link = container.querySelector('a[download]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(audio.getAttribute('src')).not.toMatch(/^https?:/);
    expect(link?.getAttribute('href')).toBe('blob:audio-do-player');
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
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, blob: async () => audioDaEdge() });
    createObjectURL.mockReset().mockImplementation((_blob: Blob) => 'blob:audio-do-player');
    revokeObjectURL.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
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
