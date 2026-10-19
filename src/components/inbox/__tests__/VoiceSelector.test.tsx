/**
 * Doc 11 (achado G6) — a prévia de voz: a resposta atrasada do TTS continuava e
 * tocava POR BAIXO da voz nova, e cada clique em ▶ pagava de novo a mesma
 * síntese (texto de amostra fixo, 11 vozes).
 *
 * Estes testes renderizam o componente REAL e abrem o menu como o usuário:
 * pointerdown/pointerup/click no gatilho (o DropdownMenu do Radix abre no
 * pointerdown, não no click).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { toastErro } = vi.hoisted(() => ({ toastErro: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: toastErro } }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));
vi.mock('@/integrations/supabase/client', () => ({ SUPABASE_URL: 'http://tts.local' }));
vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn(async () => ({ apikey: 'de-teste' })),
}));
vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: vi.fn(() => () => {}) }));

import { VoiceSelector, ELEVENLABS_VOICES } from '../VoiceSelector';
import { limparCacheDePreviaDeVoz } from '@/lib/voicePreviewCache';

const VOZ = ELEVENLABS_VOICES[0];
const BLOB_DA_PREVIA = new Blob(['previa-tts'], { type: 'audio/mpeg' });

const respostaOk = () =>
  ({ ok: true, status: 200, blob: async () => BLOB_DA_PREVIA }) as unknown as Response;

function abrirMenu() {
  const gatilho = screen.getByRole('button', { name: new RegExp(VOZ.name) });
  fireEvent.pointerDown(gatilho, { button: 0 });
  fireEvent.pointerUp(gatilho, { button: 0 });
  fireEvent.click(gatilho);
}

const botaoOuvir = () => screen.getByRole('button', { name: `Ouvir prévia da voz ${VOZ.name}` });

describe('G6 — prévia de voz do VoiceSelector', () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Sessão nova começa sem cache (o cache é de módulo, vive o navegador todo).
    limparCacheDePreviaDeVoz();
    play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true, writable: true, value: play,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
      configurable: true, writable: true, value: vi.fn(),
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true, value: vi.fn(() => 'blob:previa-tts'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true, writable: true, value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a MESMA voz tocada duas vezes paga uma só síntese (cache de sessão)', async () => {
    const chamadaFetch = vi.fn(async () => respostaOk());
    vi.stubGlobal('fetch', chamadaFetch);

    render(<VoiceSelector selectedVoiceId={VOZ.id} onVoiceChange={vi.fn()} />);
    abrirMenu();

    await act(async () => { fireEvent.click(botaoOuvir()); });
    await act(async () => { fireEvent.click(botaoOuvir()); });

    expect(chamadaFetch).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('o ▶ da prévia é um botão de verdade, com rótulo próprio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaOk()));

    render(<VoiceSelector selectedVoiceId={VOZ.id} onVoiceChange={vi.fn()} />);
    abrirMenu();

    expect(botaoOuvir()).toHaveAttribute('type', 'button');
  });

  it('fechar o menu durante a geração aborta o fetch e o áudio atrasado não toca', async () => {
    let sinal: AbortSignal | null | undefined = null;
    let liberar: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      sinal = init?.signal;
      return new Promise<Response>((resolve) => { liberar = resolve; });
    }));

    render(<VoiceSelector selectedVoiceId={VOZ.id} onVoiceChange={vi.fn()} />);
    abrirMenu();

    await act(async () => { fireEvent.click(botaoOuvir()); });

    // Usuário fecha o menu no meio da geração.
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    });

    expect((sinal as AbortSignal | null | undefined)?.aborted).toBe(true);

    // A resposta chega DEPOIS do fechamento: não pode tocar nada.
    await act(async () => {
      liberar(respostaOk());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(play).not.toHaveBeenCalled();
    expect(toastErro).not.toHaveBeenCalled();
  });
});
