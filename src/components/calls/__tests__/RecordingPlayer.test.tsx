import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
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

/**
 * TEL-RECORDING-001: o `RecordingPlayer` recebe a gravacao pelo `useCallRecording`. Neste arquivo
 * o hook e mockado SO para entregar os BYTES da Edge (`blob`) - o contrato que o hook passa a
 * expor - sem tocar no hook (ele tem cartao proprio). Sem override o mock DELEGA para o hook
 * real, entao os testes antigos (T67/VOL-02) continuam exercitando o caminho real de verdade.
 */
const gravacao = vi.hoisted(() => ({
  atual: null as null | { disponivel: boolean; url: string | null; blob?: Blob | null },
}));

vi.mock('@/hooks/calls/useCallRecording', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/calls/useCallRecording')>();
  return {
    ...real,
    useCallRecording: (
      callId: string | null | undefined,
      recordingStatus: string | null | undefined,
    ) => gravacao.atual ?? real.useCallRecording(callId, recordingStatus),
  };
});

const renderPlayer = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

/**
 * Root com `StrictMode` REAL no topo: o efeito e montado, desmontado e montado de novo.
 * (O `StrictMode` precisa ficar FORA do `QueryClientProvider`: com o provider por dentro a
 * remontagem simulada do efeito nao acontece.)
 */
const renderPlayerEstrito = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </StrictMode>,
  );
};

const audioDoPlayer = (container: HTMLElement) => container.querySelector('audio') as HTMLAudioElement;

const audioDaEdge = () => new Blob(['bytes-de-audio-mp3'], { type: 'audio/mpeg' });

describe('RecordingPlayer (T67)', () => {
  beforeEach(() => {
    gravacao.atual = null;
    invoke.mockReset().mockResolvedValue({ data: { url: 'https://exemplo/g.mp3' }, error: null });
  });

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
    gravacao.atual = null;
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

/**
 * TEL-RECORDING-001 — o ciclo do endereco `blob:` e do PLAYER: a Edge entrega os bytes e o
 * player monta o endereco local no <audio> e no link de download. Cada caso renderiza UM player
 * (c3 e c4 sao cenarios independentes: juntar os dois no mesmo `it` deixava o segundo player
 * invisivel para o proprio teste).
 */
describe('RecordingPlayer (TEL-RECORDING-001) — ciclo do endereco blob', () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  let criados = 0;

  beforeEach(() => {
    criados = 0;
    createObjectURL.mockReset().mockImplementation(() => `blob:gravacao-${(criados += 1)}`);
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    gravacao.atual = null;
  });

  const revogados = () => revokeObjectURL.mock.calls.map((c) => c[0] as string);

  it('c4: com os bytes da Edge o <audio> e o link de download usam o endereco local, nunca a URL de origem', async () => {
    gravacao.atual = { disponivel: true, url: null, blob: audioDaEdge() };

    const { container } = renderPlayer(<RecordingPlayer callId="c4" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player');

    const audio = audioDoPlayer(container);
    const link = container.querySelector('a[download]') as HTMLAnchorElement | null;

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('blob:gravacao-1'));
    expect(link?.getAttribute('href')).toBe('blob:gravacao-1');
    expect(audio.getAttribute('src')).not.toMatch(/^https?:/);
    expect(link?.getAttribute('href')).not.toMatch(/^https?:/);
  });

  it('sob remontagem de efeito o <audio> usa o endereco VIVO: um endereco revogado nao permanece como src', async () => {
    gravacao.atual = { disponivel: true, url: null, blob: audioDaEdge() };

    // StrictMode REAL: o efeito roda, e limpo e roda de novo. Se a URL fosse criada fora do
    // efeito (derivada na renderizacao), a remontagem nao criaria outro endereco e o <audio>
    // ficaria apontando para um `blob:` ja revogado.
    const { container } = renderPlayerEstrito(
      <RecordingPlayer callId="c5" recordingStatus="available" />,
    );
    await screen.findByTestId('tel-recording-player');

    const audio = audioDoPlayer(container);
    const emUso = audio.getAttribute('src');

    // Houve revogacao no ciclo (a limpeza do efeito aconteceu) e o endereco EM USO nao esta
    // entre os revogados.
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(emUso).toBeTruthy();
    expect(revogados()).not.toContain(emUso);
    // A remontagem criou um endereco NOVO (criacao e revogacao no mesmo efeito).
    expect(createObjectURL.mock.results.map((r) => r.value)).toContain(emUso);
    expect(emUso).toBe('blob:gravacao-2');
    expect(revogados()).toEqual(['blob:gravacao-1']);
  });
});
