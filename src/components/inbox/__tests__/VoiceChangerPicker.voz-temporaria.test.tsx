import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

/**
 * PK-16/PK-17 — a voz transformada do atendente é dado pessoal: ela subia para o
 * bucket PÚBLICO `audio-memes` com a chave `voice-changer/<ts>_<uuid>.mp3` (sem pasta
 * do usuário). O destino correto é o bucket PRIVADO `voice-changer-tmp` (expurgo por
 * TTL de 24h), em `<auth.uid()>/`, e o envio usa URL assinada — `/object/public/` de
 * bucket privado devolve 400.
 */
const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  open: undefined as boolean | undefined,
}));

const storageState = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}));

const authState = vi.hoisted(() => ({ getUser: vi.fn() }));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

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

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open, onOpenChange }: { children: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => {
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
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }), getUser: authState.getUser },
    storage: { from: storageState.from },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

const UID = 'b0b0b0b0-1111-2222-3333-444444444444';
const TRANSFORMED_URL = 'blob:mock-voz-transformada';
const SIGNED_URL = 'https://proj.supabase.co/storage/v1/object/sign/voice-changer-tmp/voz.mp3?token=abc';

class MockMediaRecorder {
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
  constructor(public stream: unknown, public options?: unknown) {}
}

const getUserMedia = vi.fn();

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

describe('VoiceChangerPicker — voz transformada no bucket temporário do usuário (PK-17)', () => {
  beforeEach(() => {
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    storageState.from.mockReset().mockImplementation((bucket: string) => ({
      upload: (path: string, blob: unknown, opts: unknown) => storageState.upload(bucket, path, blob, opts),
      createSignedUrl: (path: string, expiresIn: number) => storageState.createSignedUrl(bucket, path, expiresIn),
    }));
    storageState.upload.mockReset().mockResolvedValue({ error: null });
    storageState.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: SIGNED_URL }, error: null });
    authState.getUser.mockReset().mockResolvedValue({ data: { user: { id: UID } } });
    toastMock.error.mockReset();
    toastMock.success.mockReset();
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => TRANSFORMED_URL) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/functions/v1/voice-changer')) {
          return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }) };
        }
        return { ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('grava em `voice-changer-tmp/<uid>/` e envia a URL assinada do objeto', async () => {
    const onSendAudio = vi.fn();
    render(<VoiceChangerPicker onSendAudio={onSendAudio} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: vi.fn(() => [track]) });

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    await act(async () => {
      fireEvent.click(botaoPorTexto('Enviar'));
    });

    expect(storageState.upload).toHaveBeenCalledTimes(1);
    const [bucket, path] = storageState.upload.mock.calls[0] as [string, string];
    expect(bucket).toBe('voice-changer-tmp');
    expect(path).toMatch(new RegExp(`^${UID}/voice_\\d+_[0-9a-f-]+\\.mp3$`));

    // URL assinada do MESMO objeto (bucket privado não tem URL pública) e envio com ela.
    expect(storageState.createSignedUrl).toHaveBeenCalledWith('voice-changer-tmp', path, 3600);
    expect(onSendAudio).toHaveBeenCalledWith(SIGNED_URL);
  });

  it('sem sessão não grava a voz fora da pasta do usuário', async () => {
    authState.getUser.mockResolvedValue({ data: { user: null } });
    const onSendAudio = vi.fn();
    render(<VoiceChangerPicker onSendAudio={onSendAudio} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: vi.fn(() => [track]) });

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Enviar'));
    });

    expect(storageState.upload).not.toHaveBeenCalled();
    expect(onSendAudio).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });
});
