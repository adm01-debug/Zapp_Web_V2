/**
 * #350 — a prévia do TTS não pode ser descartada antes de o envio confirmar.
 *
 * O botão chamava `onAudioReady(blob)` e, sem esperar o resultado, fechava o
 * popover e limpava `convertedBlob`/`convertedUrl`. Com a ponte do inbox
 * (`handleAudioSend` é assíncrona e devolve `false` quando falha) e com um envio
 * que rejeita, o áudio gerado sumia da tela e o usuário não conseguia reenviar.
 *
 * Estes testes renderizam o componente REAL e chegam à prévia pelo caminho do
 * usuário: clicar no gatilho, escolher a voz (o áudio é "gerado" pela resposta
 * simulada da Edge Function) e clicar em "Enviar Áudio".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const { toastErro, toastSucesso } = vi.hoisted(() => ({
  toastErro: vi.fn(),
  toastSucesso: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastErro, success: toastSucesso } }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const semAnimacao = ({
    whileTap,
    whileHover,
    initial,
    animate,
    exit,
    transition,
    variants,
    ...rest
  }: Record<string, unknown>) => rest;

  return {
    motion: {
      button: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
        React.createElement('button', { ...semAnimacao(props), ref }),
      ),
      div: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
        React.createElement('div', { ...semAnimacao(props), ref }),
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// A guarda de rede do setup recusa hosts `*.supabase.*`; aqui nem a rede entra:
// a resposta da Edge Function de TTS é simulada e a URL aponta para um host local.
vi.mock('@/integrations/supabase/client', () => ({ SUPABASE_URL: 'http://tts.local' }));
vi.mock('@/lib/edgeAuthHeaders', () => ({ edgeAuthHeaders: vi.fn(async () => ({ apikey: 'teste' })) }));
vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: vi.fn(() => () => {}) }));

import { TooltipProvider } from '@/components/ui/tooltip';
import { TextToAudioButton } from '../TextToAudioButton';
import { ELEVENLABS_VOICES } from '../VoiceSelector';

const URL_DA_PREVIA = 'blob:previa-tts';
const BLOB_GERADO = new Blob(['audio-gerado-pela-edge'], { type: 'audio/mpeg' });
const TEXTO = 'Olá, tudo bem?';

let revogarUrl: ReturnType<typeof vi.fn>;

function semearPreviaGerada() {
  const chamadaFetch = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        blob: async () => BLOB_GERADO,
      }) as unknown as Response,
  );
  vi.stubGlobal('fetch', chamadaFetch);
  return chamadaFetch;
}

/** Chega na prévia pelo caminho do usuário e devolve o botão de enviar. */
async function renderizarComPrevia(onAudioReady: (blob: Blob) => unknown) {
  render(
    <TooltipProvider>
      <TextToAudioButton inputValue={TEXTO} onAudioReady={onAudioReady as (blob: Blob) => void} />
    </TooltipProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Texto para Áudio (TTS)' }));

  const voz = await screen.findByRole('button', { name: new RegExp(ELEVENLABS_VOICES[0].name) });
  await act(async () => {
    fireEvent.click(voz);
  });

  // A prévia existe: o rodapé mostra a voz escolhida e o botão de enviar.
  const enviar = await screen.findByRole('button', { name: /Enviar Áudio/ });
  return { enviar };
}

/** O botão de reprodução do rodapé (só existe com a prévia montada). */
const botaoDaPrevia = () => screen.getByRole('button', { name: /prévia/i });

describe('#350 — prévia do TTS sobrevive a falha de envio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revogarUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => URL_DA_PREVIA),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revogarUrl,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    semearPreviaGerada();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envio que REJEITA mantém o popover aberto, o botão de reenvio e o MESMO áudio', async () => {
    const onAudioReady = vi.fn().mockRejectedValue(new Error('rede fora'));
    const { enviar } = await renderizarComPrevia(onAudioReady);

    await act(async () => {
      fireEvent.click(enviar);
    });

    // erro aparece e nenhum sucesso é anunciado
    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(toastSucesso).not.toHaveBeenCalledWith('Áudio enviado!');

    // recebeu exatamente o áudio gerado — a mesma prévia, não uma vazia
    expect(onAudioReady).toHaveBeenCalledTimes(1);
    expect(onAudioReady.mock.calls[0][0]).toBe(BLOB_GERADO);

    // a prévia continua em tela, pronta para reenvio
    expect(screen.getByText('Enviar como Áudio')).toBeInTheDocument();
    expect(screen.getByText(/Voz:/)).toBeInTheDocument();
    const reenviar = screen.getByRole('button', { name: /Enviar Áudio/ });
    expect(reenviar).toBeEnabled();
    expect(botaoDaPrevia()).toBeEnabled();

    // e o endereço do áudio não foi revogado
    expect(revogarUrl).not.toHaveBeenCalled();
  });

  it('envio que devolve `false` (a ponte do inbox) também preserva a prévia', async () => {
    const onAudioReady = vi.fn().mockResolvedValue(false);
    const { enviar } = await renderizarComPrevia(onAudioReady);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onAudioReady).toHaveBeenCalledTimes(1);
    expect(toastSucesso).not.toHaveBeenCalledWith('Áudio enviado!');
    expect(screen.getByText(/Voz:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar Áudio/ })).toBeEnabled();
    expect(revogarUrl).not.toHaveBeenCalled();
  });

  it('a prévia preservada continua tocando e pausando (retry real, não só o rótulo)', async () => {
    const onAudioReady = vi.fn().mockRejectedValue(new Error('rede fora'));
    const { enviar } = await renderizarComPrevia(onAudioReady);

    await act(async () => {
      fireEvent.click(enviar);
    });
    await waitFor(() => expect(toastErro).toHaveBeenCalled());

    // o áudio gerado segue na mão: ainda tocando e pausável depois da falha
    expect(botaoDaPrevia()).toHaveAccessibleName('Parar prévia');
    await act(async () => {
      fireEvent.click(botaoDaPrevia());
    });
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reproduzir prévia' })).toBeInTheDocument();
  });

  it('envio CONFIRMADO fecha o popover e descarta a prévia (regressão do caminho bom)', async () => {
    const onAudioReady = vi.fn().mockResolvedValue(true);
    const { enviar } = await renderizarComPrevia(onAudioReady);

    await act(async () => {
      fireEvent.click(enviar);
    });

    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Áudio enviado!'));
    expect(toastErro).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Enviar como Áudio')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Enviar Áudio/ })).not.toBeInTheDocument();
    expect(revogarUrl).toHaveBeenCalledWith(URL_DA_PREVIA);
  });
});
