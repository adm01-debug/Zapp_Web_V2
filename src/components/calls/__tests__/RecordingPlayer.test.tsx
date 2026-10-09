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

// CI com cobertura roda este arquivo ~7x mais devagar que a maquina local (20 s contra 2,7 s): a cadeia
// getSession -> fetch -> Blob -> render estourava o 1 s padrao do findBy. Folga so de tempo, sem afrouxar nenhuma asserção.
vi.setConfig({ testTimeout: 20_000 });

const getSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://zapp-local.supabase.co',
  supabase: { auth: { getSession: (...args: unknown[]) => getSession(...args) } },
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

const fetchMock = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let sequenciaDeUrlBlob = 0;

const novoQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderPlayer = (ui: React.ReactElement, qc = novoQueryClient()) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

/**
 * Root com `StrictMode` REAL no topo: o efeito e montado, desmontado e montado de novo.
 * (O `StrictMode` precisa ficar FORA do `QueryClientProvider`: com o provider por dentro a
 * remontagem simulada do efeito nao acontece.)
 */
const renderPlayerEstrito = (ui: React.ReactElement) => {
  const qc = novoQueryClient();
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </StrictMode>,
  );
};

const audioDoPlayer = (container: HTMLElement) => container.querySelector('audio') as HTMLAudioElement;

const audioDaEdge = () => new Blob(['bytes-de-audio-mp3'], { type: 'audio/mpeg' });

function respostaAudio(corpo = 'ID3-audio') {
  // Corpo em TEXTO (nao em Blob do jsdom): o Response do Node nem sempre entende o Blob do jsdom e entregaria 0 bytes
  // (o hook trata 0 bytes como 'sem gravacao'), o que so aparecia no CI.
  return Promise.resolve(new Response(corpo, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
}

// `expect.any(Blob)` compara com o Blob GLOBAL do jsdom, mas `Response.blob()` do Node devolve o Blob do Node (outro realm):
// no CI a checagem de classe falha mesmo com o objeto certo. Aqui se confere o que importa: tem bytes e o tipo do audio.
function expectBlobDeAudio(mockCriar: ReturnType<typeof vi.fn>) {
  expect(mockCriar).toHaveBeenCalled();
  const recebido = mockCriar.mock.calls[0][0] as Blob;
  expect(recebido.size).toBeGreaterThan(0);
  expect(recebido.type).toBe('audio/mpeg');
}

function prepararAmbiente() {
  gravacao.atual = null;
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'jwt-local' } }, error: null });
  fetchMock.mockReset().mockImplementation(() => respostaAudio());
  sequenciaDeUrlBlob = 0;
  createObjectURL.mockReset().mockImplementation(() => `blob:gravacao-${++sequenciaDeUrlBlob}`);
  revokeObjectURL.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
}

describe('RecordingPlayer (T67)', () => {
  beforeEach(prepararAmbiente);

  it('nao renderiza nada quando a chamada nao tem gravacao', () => {
    renderPlayer(<RecordingPlayer callId="c1" recordingStatus="none" />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
  });

  it('nao renderiza nem requisita quando a chamada nao diz que tem', () => {
    renderPlayer(<RecordingPlayer callId="c2" recordingStatus={null} />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('com gravacao disponivel baixa o stream pela Edge como Blob e nunca recebe recording_url', async () => {
    const { container } = renderPlayer(<RecordingPlayer callId="c3" recordingStatus="available" />);

    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://zapp-local.supabase.co/functions/v1/get-call-recording',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-local', 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: 'c3' }),
        cache: 'no-store',
      }),
    );
    expectBlobDeAudio(createObjectURL);
    const audio = audioDoPlayer(container);
    expect(audio.getAttribute('src')).toBe('blob:gravacao-1');
    const htmlSemXmlnsSvg = JSON.stringify(document.body.innerHTML).replace(
      /http:\/\/www\.w3\.org\/2000\/svg/g,
      '[svg-namespace]',
    );
    expect(htmlSemXmlnsSvg).not.toContain('http');
    expect(htmlSemXmlnsSvg).not.toContain('recording_url');
    expect(htmlSemXmlnsSvg).not.toContain('https://gravacoes');
  });

  it('404 da Edge continua sendo tratado como chamada sem gravacao', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Sem gravacao disponivel', { status: 404 }));

    renderPlayer(<RecordingPlayer callId="c404" recordingStatus="available" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 10_000 });
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('resposta 200 sem bytes (blob vazio) e tratada como chamada sem gravacao', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    renderPlayer(<RecordingPlayer callId="cvazio" recordingStatus="available" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 10_000 });
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    // Blob vazio nunca vira object URL: nao ha audio para tocar.
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

/**
 * Refazer #62 — o cache do react-query sobrevive ao desmontar por `staleTime` (5 min).
 * Se a URL `blob:` guardada no cache for revogada no cleanup, a remontagem dentro do
 * staleTime devolve uma URL morta e o audio quebra. O teste usa o MESMO QueryClient
 * nas duas montagens da MESMA chamada: o cache tem de sobreviver, e cada montagem
 * precisa criar uma object URL nova a partir do Blob cacheado (sem novo download).
 */
describe('RecordingPlayer (#62) — URL blob revogada nunca volta do cache', () => {
  beforeEach(prepararAmbiente);

  it('desmontar revoga a URL e remontar gera URL nova a partir do Blob em cache', async () => {
    const qc = novoQueryClient();
    const ui = <RecordingPlayer callId="r1" recordingStatus="available" />;

    const primeiro = renderPlayer(ui, qc);
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });
    const src1 = audioDoPlayer(primeiro.container).getAttribute('src');
    expect(src1).toMatch(/^blob:/);

    primeiro.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith(src1);

    const segundo = renderPlayer(ui, qc);
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });
    const src2 = audioDoPlayer(segundo.container).getAttribute('src');

    // A remontagem nao pode herdar a URL revogada: nasce uma URL blob NOVA...
    expect(src2).toMatch(/^blob:/);
    expect(src2).not.toBe(src1);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(src2);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    // ...a partir do Blob que ja estava no cache, sem baixar de novo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    prepararAmbiente();
    act(() => {
      setVolume(DEFAULT_MEDIA_VOLUME_STATE.volume);
      setMuted(DEFAULT_MEDIA_VOLUME_STATE.muted);
    });
  });

  it('o <audio> efetivo nasce no volume global e acompanha ajustes e mute', async () => {
    act(() => setVolume(40));

    const { container } = renderPlayer(<RecordingPlayer callId="v1" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });
    const audio = audioDoPlayer(container);
    expect(audio).not.toBeNull();

    // Ganho perceptual aplicado pelo controle unico: (40/100)^2 = 0.16.
    await waitFor(() => expect(audio.volume).toBeCloseTo(toGain(40), 5), { timeout: 10_000 });
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
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });
    const audio = audioDoPlayer(container);
    await waitFor(() => expect(audio.volume).toBeCloseTo(toGain(40), 5), { timeout: 10_000 });

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
  beforeEach(prepararAmbiente);

  const revogados = () => revokeObjectURL.mock.calls.map((c) => c[0] as string);

  it('c4: com os bytes da Edge o <audio> e o link de download usam o endereco local, nunca a URL de origem', async () => {
    gravacao.atual = { disponivel: true, url: null, blob: audioDaEdge() };

    const { container } = renderPlayer(<RecordingPlayer callId="c4" recordingStatus="available" />);
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });

    const audio = audioDoPlayer(container);
    const link = container.querySelector('a[download]') as HTMLAnchorElement | null;

    expectBlobDeAudio(createObjectURL);
    await waitFor(() => expect(audio.getAttribute('src')).toBe('blob:gravacao-1'), { timeout: 10_000 });
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
    await screen.findByTestId('tel-recording-player', {}, { timeout: 10_000 });

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
