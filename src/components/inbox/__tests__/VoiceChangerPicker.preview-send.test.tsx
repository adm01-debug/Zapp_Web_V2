import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import type { ReactNode } from 'react';

// Regressão #350: o VoiceChangerPicker fechava o popover e limpava a prévia da
// voz transformada ANTES de saber o resultado do envio da mensagem. Quando o
// `onSendAudioBlob` (síncrono ou assíncrono) rejeitava/lançava/devolvia `false`,
// o usuário perdia a prévia e não conseguia tentar enviar de novo.
//
// Voz do contato é dado de cliente: o picker entrega o Blob para o caminho do
// áudio gravado (bucket privado, pasta do contato) e NÃO sobe mais nada em
// `audio-memes/voice-changer/...` (bucket público, cache de um ano) — o upload
// antigo ainda era recusado pela policy de INSERT para atendente comum.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  open: undefined as boolean | undefined,
}));

const storageState = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

// jsdom + framer-motion não concluem as animações do AnimatePresence, então os
// estados de gravação/prévia não montavam de forma determinística. Mesmo
// pass-through usado nos testes de controles de volume do repositório.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  useReducedMotion: () => false,
}));

// Pass-through do Radix Popover (não abre de forma confiável sob jsdom). Além de
// capturar o onOpenChange, guardamos a prop `open` para provar que o popover só
// fecha depois do sucesso do envio.
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
    popoverState.onOpenChange = onOpenChange;
    popoverState.open = open;
    return <>{children}</>;
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    storage: {
      from: vi.fn(() => ({
        upload: storageState.upload,
        getPublicUrl: storageState.getPublicUrl,
      })),
    },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

const TRANSFORMED_URL = 'blob:mock-voz-transformada';

type HandlerEnvio = (blob: Blob) => void | boolean | Promise<void | boolean>;

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

function makeStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: vi.fn(() => [track]) };
  return { stream, track };
}

function botaoPorIcone(classe: string): HTMLButtonElement {
  const icon = document.querySelector(`.${classe}`);
  const btn = icon?.closest('button');
  if (!btn) throw new Error(`botão ${classe} não encontrado`);
  return btn as HTMLButtonElement;
}

function botaoPorTexto(texto: string): HTMLButtonElement {
  const alvo = screen.getByText(texto);
  const btn = alvo.closest('button');
  if (!btn) throw new Error(`botão "${texto}" não encontrado`);
  return btn as HTMLButtonElement;
}

describe('VoiceChangerPicker — prévia preservada quando o envio falha (#350)', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    storageState.upload.mockReset().mockResolvedValue({ error: null });
    storageState.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://cdn.test/nao-usado.mp3' } });
    toastMock.error.mockReset();
    toastMock.success.mockReset();
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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Percorre o caminho REAL do componente: renderiza -> abre -> grava -> para ->
  // transforma a voz, parando com a prévia transformada na tela.
  async function prepararComPrevia(onSendAudioBlob: HandlerEnvio) {
    render(<VoiceChangerPicker onSendAudioBlob={onSendAudioBlob} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    const { stream } = makeStream();
    getUserMedia.mockResolvedValue(stream);

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });

    // Estado A: gravou, ainda sem prévia transformada.
    expect(screen.getByText('Transformar voz')).toBeInTheDocument();
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    // Estado B: prévia transformada disponível.
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    return botaoPorTexto('Enviar');
  }

  it('entrega o áudio transformado como Blob e não toca em bucket nenhum', async () => {
    const onSendAudioBlob = vi.fn();
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudioBlob).toHaveBeenCalledTimes(1);
    const blob = onSendAudioBlob.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(0);
    // O upload é do caminho do áudio gravado, feito por quem conhece a pasta do
    // contato: o picker não sobe nada (antes subia em audio-memes/voice-changer).
    expect(storageState.upload).not.toHaveBeenCalled();
    expect(storageState.getPublicUrl).not.toHaveBeenCalled();
  });

  it('mantém popover aberto, toast de erro e prévia para retry quando onSendAudioBlob rejeita', async () => {
    const onSendAudioBlob = vi.fn().mockRejectedValue(new Error('falha no envio da mensagem'));
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudioBlob).toHaveBeenCalledWith(expect.any(Blob));
    // O popover continua aberto...
    expect(popoverState.open).toBe(true);
    // ...e a prévia transformada continua na tela, pronta para novo envio.
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalled();
    // `isSending` volta a false: dá para tentar de novo.
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
  });

  it('trata devolver `false` (contrato do caminho do áudio gravado) como falha', async () => {
    const onSendAudioBlob = vi.fn().mockResolvedValue(false);
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudioBlob).toHaveBeenCalledWith(expect.any(Blob));
    expect(popoverState.open).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalledWith('Áudio enviado! 🎤');
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
  });

  it('trata onSendAudioBlob que LANÇA erro síncrono como falha (não fecha nem limpa)', async () => {
    const onSendAudioBlob = vi.fn(() => {
      throw new Error('lançou na hora');
    });
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(popoverState.open).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalled();
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
  });

  it('só fecha o popover e limpa a prévia DEPOIS de o envio assíncrono resolver', async () => {
    let resolver: () => void = () => {};
    const onSendAudioBlob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    // Envio pendente: nada foi fechado nem limpo ainda.
    expect(onSendAudioBlob).toHaveBeenCalledWith(expect.any(Blob));
    expect(popoverState.open).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();

    await act(async () => {
      resolver();
    });

    // Só agora, com sucesso confirmado, o popover fecha e a prévia some.
    expect(popoverState.open).toBe(false);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('aceita onSendAudioBlob síncrono (void) e fecha o popover no sucesso', async () => {
    const onSendAudioBlob = vi.fn();
    const enviar = await prepararComPrevia(onSendAudioBlob);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudioBlob).toHaveBeenCalledWith(expect.any(Blob));
    expect(popoverState.open).toBe(false);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

// A prova de que o áudio sai pelo caminho PRIVADO não vive só no mock: a fiação
// de cada painel tem de entregar o Blob ao caminho do áudio gravado
// (`onAudioSend` → bucket privado, pasta do contato/conversa) e o meme continua
// com o `onSendAudioMeme`. O guard varre o fonte para que a regressão (voltar a
// `audio-memes/voice-changer/...`) quebre o teste.
describe('VoiceChangerPicker — fiação do envio privado e guard do caminho antigo', () => {
  const ler = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

  it.each([
    ['inbox', 'src/components/inbox/chat/ChatInputToolbars.tsx'],
    ['chat interno', 'src/components/team-chat/TeamChatInputArea.tsx'],
  ])('%s: VoiceChangerPicker recebe o caminho do áudio gravado (onAudioSend)', (_rotulo, arquivo) => {
    const fonte = ler(arquivo);
    expect(fonte).toMatch(/<VoiceChangerPicker onSendAudioBlob=\{onAudioSend\} \/>/);
    // O meme continua no handler dele — o áudio do cliente não volta para lá.
    expect(fonte).toMatch(/<AudioMemePicker onSendAudio=\{onSendAudioMeme\} \/>/);
  });

  it('nenhum arquivo de src sobe a voz do cliente em audio-memes/voice-changer', () => {
    for (const arquivo of [
      'src/components/inbox/VoiceChangerPicker.tsx',
      'src/components/inbox/chat/ChatInputToolbars.tsx',
      'src/components/team-chat/TeamChatInputArea.tsx',
    ]) {
      const fonte = ler(arquivo);
      expect(fonte).not.toMatch(/getPublicUrl\(/);
      expect(fonte).not.toMatch(/from\('audio-memes'\)/);
      expect(fonte).not.toMatch(/['"`]voice-changer\//);
    }
  });
});
