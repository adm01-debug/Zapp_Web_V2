/**
 * #350 (R2-INB-058) — o `handleSendAudioMeme` do inbox engolia a falha do envio:
 * o `try/catch` fazia o toast e NÃO relançava, então a Promise resolvia sempre.
 * O `VoiceChangerPicker` só preserva a prévia da voz transformada (popover
 * aberto + `transformedUrl` em tela) quando `onSendAudio` REJEITA — logo, na
 * prática a prévia continuava sendo descartada quando o envio falhava.
 *
 * Aqui o hook REAL é chamado (`renderHook`, com o `sendOutboundMessage` mockado
 * apenas na fronteira: é a chamada de rede, não o código sob teste) e também
 * ligado ao `VoiceChangerPicker` REAL — a mesma fiação de
 * ChatPanel.tsx → ChatInputArea → ChatInputToolbars → VoiceChangerPicker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderHook, render, fireEvent, act, screen } from '@testing-library/react';

const estado = vi.hoisted(() => ({
  enviar: vi.fn(),
  toastZapp: vi.fn(),
  toastSonner: { error: vi.fn(), success: vi.fn() },
  popoverAberto: undefined as boolean | undefined,
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  onOpenChangeRaiz: undefined as ((v: boolean) => void) | undefined,
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  contatoConnectionId: 'conn-1' as string | null,
  instanceId: 'inst-1' as string | null,
  rpcs: [] as string[],
}));

vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: estado.enviar }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: estado.toastZapp }));
vi.mock('sonner', () => ({ toast: estado.toastSonner }));

// jsdom + framer-motion não concluem as animações do AnimatePresence, então os
// estados de gravação/prévia não montavam de forma determinística.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

// Radix Popover não abre de forma confiável sob jsdom: o pass-through guarda a
// prop `open` para provar que o popover só fecha depois do sucesso do envio.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }) => {
    estado.popoverAberto = open;
    estado.onOpenChange = onOpenChange;
    // O primeiro Popover do arquivo é o da raiz do picker em teste: os pickers
    // aninhados (CategorySelector) registram depois e sobrescreveriam o capture.
    if (!estado.onOpenChangeRaiz) estado.onOpenChangeRaiz = onOpenChange;
    return React.createElement(React.Fragment, null, children);
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverContent: ({ children }: { children: ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/integrations/supabase/client', () => {
  const responderDaTabela = (tabela: string) => {
    const resultado =
      tabela === 'contacts'
        ? {
            data: estado.contatoConnectionId
              ? { whatsapp_connection_id: estado.contatoConnectionId }
              : null,
            error: null,
          }
        : { data: estado.instanceId ? { instance_id: estado.instanceId } : null, error: null };
    const corrente: Record<string, unknown> = {};
    corrente.select = () => corrente;
    corrente.eq = () => corrente;
    corrente.limit = () => corrente;
    corrente.maybeSingle = async () => resultado;
    return corrente;
  };
  return {
    supabase: {
      from: (tabela: string) => responderDaTabela(tabela),
      rpc: async (nome: string) => {
        if (nome === 'fn_list_audio_memes_for_user') {
          return {
            data: [
              {
                id: 'meme-1',
                name: 'Risada',
                audio_url: 'https://cdn.test/risada.mp3',
                category: 'risada',
                duration_seconds: 2,
                is_favorite: false,
                use_count: 0,
              },
            ],
            error: null,
          };
        }
        estado.rpcs.push(nome);
        return { data: null, error: null };
      },
      auth: { getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => ({ upload: estado.upload, getPublicUrl: estado.getPublicUrl }) },
    },
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'anon-de-teste',
  };
});

import { useChatMediaSending } from '../useChatMediaSending';
import { VoiceChangerPicker } from '../VoiceChangerPicker';
import { AudioMemePicker } from '../AudioMemePicker';

const CONTATO = 'contato-1';
const TELEFONE = '5511999999999';
const AUDIO_URL = 'https://cdn.test/audio-meme.mp3';
const TRANSFORMED_URL = 'blob:mock-voz-transformada';
const PUBLIC_URL = 'https://cdn.test/voz-transformada.mp3';

/** Fiação real do painel: o hook do inbox alimenta o picker de voz. */
function FluxoInbox() {
  const { handleSendAudioMeme } = useChatMediaSending(CONTATO, TELEFONE);
  return React.createElement(VoiceChangerPicker, { onSendAudio: handleSendAudioMeme });
}

/** Mesma fiação, para o outro picker que recebe o hook (`AudioMemePicker`). */
function FluxoInboxMeme() {
  const { handleSendAudioMeme } = useChatMediaSending(CONTATO, TELEFONE);
  return React.createElement(AudioMemePicker, { onSendAudio: handleSendAudioMeme });
}

const rejeicoesNaoTratadas: unknown[] = [];
const guardarRejeicaoNaoTratada = (motivo: unknown) => {
  rejeicoesNaoTratadas.push(motivo);
};

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });
  constructor(
    public stream: unknown,
    public options?: unknown,
  ) {
    MockMediaRecorder.instances.push(this);
  }
}

const getUserMedia = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

function criarStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: vi.fn(() => [track]) }, track };
}

function botaoPorIcone(classe: string): HTMLButtonElement {
  const icone = document.querySelector(`.${classe}`);
  const btn = icone?.closest('button');
  if (!btn) throw new Error(`botão ${classe} não encontrado`);
  return btn as HTMLButtonElement;
}

function botaoPorTexto(texto: string): HTMLButtonElement {
  const btn = screen.getByText(texto).closest('button');
  if (!btn) throw new Error(`botão "${texto}" não encontrado`);
  return btn as HTMLButtonElement;
}

describe('handleSendAudioMeme sinaliza a falha do envio (#350)', () => {
  beforeEach(() => {
    estado.enviar.mockReset();
    estado.toastZapp.mockReset();
    estado.toastSonner.error.mockReset();
    estado.toastSonner.success.mockReset();
    estado.popoverAberto = undefined;
    estado.onOpenChange = undefined;
    estado.onOpenChangeRaiz = undefined;
    estado.rpcs.length = 0;
    rejeicoesNaoTratadas.length = 0;
    process.on('unhandledRejection', guardarRejeicaoNaoTratada);
    estado.upload.mockReset().mockResolvedValue({ error: null });
    estado.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
    estado.contatoConnectionId = 'conn-1';
    estado.instanceId = 'inst-1';

    MockMediaRecorder.instances = [];
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => TRANSFORMED_URL),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/voice-changer')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }),
        };
      }
      return { ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.off('unhandledRejection', guardarRejeicaoNaoTratada);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------- o hook

  it('rejeita quando sendOutboundMessage falha, mantendo o toast de erro', async () => {
    const erroDoEnvio = new Error('envio recusado pela API');
    estado.enviar.mockRejectedValueOnce(erroDoEnvio);
    const { result } = renderHook(() => useChatMediaSending(CONTATO, TELEFONE));

    let capturado: unknown = 'a Promise resolveu (falha engolida)';
    await act(async () => {
      try {
        await result.current.handleSendAudioMeme(AUDIO_URL);
      } catch (erro) {
        capturado = erro;
      }
    });

    expect(capturado).toBe(erroDoEnvio);
    expect(estado.enviar).toHaveBeenCalledTimes(1);
    expect(estado.enviar.mock.calls[0][0]).toMatchObject({
      contactId: CONTATO,
      messageType: 'audio',
      mediaUrl: AUDIO_URL,
    });
    expect(estado.toastZapp).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  it('resolve no sucesso, com uma única mensagem de sucesso', async () => {
    estado.enviar.mockResolvedValueOnce({ id: 'msg-1' });
    const { result } = renderHook(() => useChatMediaSending(CONTATO, TELEFONE));

    let rejeitou: unknown = null;
    await act(async () => {
      try {
        await result.current.handleSendAudioMeme(AUDIO_URL);
      } catch (erro) {
        rejeitou = erro;
      }
    });

    expect(rejeitou).toBeNull();
    expect(estado.enviar).toHaveBeenCalledTimes(1);
    expect(estado.toastZapp).toHaveBeenCalledTimes(1);
    expect(estado.toastZapp).toHaveBeenCalledWith(
      expect.objectContaining({ title: '🔊 Áudio meme enviado!' }),
    );
  });

  it('rejeita quando não há conexão WhatsApp: nada foi enviado, a prévia não pode voltar ao estado inicial', async () => {
    estado.contatoConnectionId = null;
    estado.instanceId = null;
    const { result } = renderHook(() => useChatMediaSending(CONTATO, TELEFONE));

    let capturado: unknown = 'a Promise resolveu (falha engolida)';
    await act(async () => {
      try {
        await result.current.handleSendAudioMeme(AUDIO_URL);
      } catch (erro) {
        capturado = erro;
      }
    });

    expect(estado.enviar).not.toHaveBeenCalled();
    expect(capturado).toBeInstanceOf(Error);
    expect((capturado as Error).message).toBe('Conexão WhatsApp não disponível.');
    // O toast de erro já saiu dentro de `ensureInstance` — ele tem de continuar.
    expect(estado.toastZapp).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Conexão WhatsApp não disponível.' }),
    );
  });

  // ------------------------------------------- o picker real com o hook real

  // Percorre o caminho REAL do VoiceChangerPicker (renderiza → abre → grava →
  // para → transforma), parando com a prévia transformada na tela.
  async function chegarNaPrevia(): Promise<HTMLButtonElement> {
    render(React.createElement(FluxoInbox));
    act(() => {
      estado.onOpenChange?.(true);
    });

    const { stream } = criarStream();
    getUserMedia.mockResolvedValue(stream);

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });

    expect(screen.getByText('Transformar voz')).toBeInTheDocument();
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    return botaoPorTexto('Enviar');
  }

  it('envio falhando: a prévia continua em tela e o popover permanece aberto', async () => {
    estado.enviar.mockRejectedValueOnce(new Error('envio recusado pela API'));
    const enviar = await chegarNaPrevia();

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(estado.enviar).toHaveBeenCalledTimes(1);
    expect(estado.enviar.mock.calls[0][0]).toMatchObject({
      contactId: CONTATO,
      messageType: 'audio',
      mediaUrl: PUBLIC_URL,
    });
    // A prévia da voz transformada sobrevive à falha...
    expect(estado.popoverAberto).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    // ...e o usuário pode tentar de novo.
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
    expect(estado.toastSonner.error).toHaveBeenCalled();
  });

  it('envio confirmado: o popover fecha e a prévia sai de tela', async () => {
    estado.enviar.mockResolvedValueOnce({ id: 'msg-1' });
    const enviar = await chegarNaPrevia();

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(estado.enviar).toHaveBeenCalledTimes(1);
    expect(estado.popoverAberto).toBe(false);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(estado.toastSonner.success).toHaveBeenCalled();
    expect(estado.toastSonner.error).not.toHaveBeenCalled();
  });

  // --------------------------------- o outro picker que recebe o mesmo hook

  it('AudioMemePicker ligado ao hook: falha no envio não deixa rejeição não tratada', async () => {
    estado.enviar.mockRejectedValueOnce(new Error('envio recusado pela API'));
    render(React.createElement(FluxoInboxMeme));

    await act(async () => {
      estado.onOpenChangeRaiz?.(true);
    });

    // A lista sai do RPC `fn_list_audio_memes_for_user` (mockado na fronteira).
    // O nome do áudio também aparece como rótulo de categoria no item, por isso
    // o alvo é o <p> do nome (o clique borbulha para a linha, que chama handleSend).
    await screen.findByText('Áudios Meme');
    const nomes = await screen.findAllByText('Risada');
    const itens = nomes.filter((el) => el.tagName === 'P');
    expect(itens).toHaveLength(1);

    await act(async () => {
      fireEvent.click(itens[0]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(estado.enviar).toHaveBeenCalledTimes(1);
    expect(estado.rpcs).toContain('fn_send_audio_meme');
    expect(estado.toastZapp).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
    // A rejeição do envio é tratada no ponto de chamada do picker.
    expect(rejeicoesNaoTratadas).toHaveLength(0);
  });
});
