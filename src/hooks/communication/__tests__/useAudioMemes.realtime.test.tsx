import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * R2-INB-044 — catálogo e favoritos de áudio meme ao vivo.
 *
 * Antes: o picker só chamava `fetchMemes` na abertura. Meme criado por outro
 * atendente (ou favorito alternado em outra aba) só aparecia reabrindo o picker.
 * Agora o hook assina `audio_memes` e `audio_meme_favorites` num ÚNICO canal de
 * nome único (padrão RT2), refaz a busca a cada evento, remove o canal ao fechar
 * e avisa (`syncError`) quando a assinatura falha.
 */

type CanalFalso = {
  topic: string;
  handlers: Record<string, Array<() => void>>;
  callbacks: Array<(status: string) => void>;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
};

let canalAtual: CanalFalso | null = null;

function criarCanal(topic: string): CanalFalso {
  const handlers: Record<string, Array<() => void>> = {};
  const callbacks: Array<(status: string) => void> = [];
  const canal: CanalFalso = {
    topic,
    handlers,
    callbacks,
    on: vi.fn((_evento: string, cfg: { table: string }, cb: () => void) => {
      (handlers[cfg.table] ||= []).push(cb);
      return canal;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      if (cb) callbacks.push(cb);
      return canal;
    }),
    unsubscribe: vi.fn(),
  };
  return canal;
}

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useAudioMemes, type AudioMemeItem } from '../useAudioMemes';

const meme = (id: string): AudioMemeItem => ({
  id,
  name: id,
  audio_url: `https://cdn.test/storage/v1/object/public/audio-memes/${id}.mp3`,
  category: 'outros',
  duration_seconds: 1,
  is_favorite: false,
  use_count: 0,
});

function renderPicker(open: boolean) {
  return renderHook(({ open: o }: { open: boolean }) => useAudioMemes(o), { initialProps: { open } });
}

/** Dispara o handler registrado para uma tabela (o evento realtime). */
function disparar(tabela: string) {
  const handlers = canalAtual?.handlers[tabela] ?? [];
  expect(handlers.length).toBeGreaterThan(0);
  return act(async () => { handlers.forEach((h) => h()); });
}

beforeEach(() => {
  vi.clearAllMocks();
  canalAtual = null;
  mocks.channel.mockImplementation((topic: string) => {
    canalAtual = criarCanal(topic);
    return canalAtual;
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe('useAudioMemes — catálogo e favoritos ao vivo', () => {
  it('assina UM canal de nome único nas duas tabelas e o remove ao fechar', async () => {
    const { rerender } = renderPicker(true);
    await act(async () => {});

    expect(mocks.channel).toHaveBeenCalledTimes(1);
    const topic1 = mocks.channel.mock.calls[0][0] as string;
    // padrão RT2: prefixo estável + sufixo único por instância
    expect(topic1.startsWith('audio-memes-realtime:')).toBe(true);
    expect(topic1).not.toBe('audio-memes-realtime');

    const canal1 = canalAtual!;
    expect(canal1.on).toHaveBeenCalledTimes(2);
    expect(canal1.on.mock.calls.map((c) => (c[1] as { table: string }).table))
      .toEqual(['audio_memes', 'audio_meme_favorites']);
    expect(canal1.on.mock.calls.map((c) => (c[1] as { event: string }).event)).toEqual(['*', '*']);
    expect(canal1.on.mock.calls.map((c) => (c[1] as { schema: string }).schema))
      .toEqual(['public', 'public']);
    expect(canal1.subscribe).toHaveBeenCalledTimes(1);

    rerender({ open: false });
    await act(async () => {});
    expect(mocks.removeChannel).toHaveBeenCalledWith(canal1);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);

    // reabrir cria um canal novo (nome único) e não reaproveita o removido
    rerender({ open: true });
    await act(async () => {});
    expect(mocks.channel).toHaveBeenCalledTimes(2);
    expect(mocks.channel.mock.calls[1][0]).not.toBe(topic1);
  });

  it('meme novo aparece sem reabrir o picker (evento em audio_memes refaz a busca)', async () => {
    const { result } = renderPicker(true);
    await act(async () => {});
    expect(result.current.memes).toEqual([]);

    mocks.rpc.mockResolvedValue({ data: [meme('novo')], error: null });
    await disparar('audio_memes');

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.memes.map((m) => m.id)).toEqual(['novo']);
  });

  it('favorito ao vivo também refaz a busca (evento em audio_meme_favorites)', async () => {
    const { result } = renderPicker(true);
    await act(async () => {});

    mocks.rpc.mockResolvedValue({ data: [{ ...meme('m1'), is_favorite: true }], error: null });
    await disparar('audio_meme_favorites');

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.memes[0]?.is_favorite).toBe(true);
  });

  it('avisa o erro de sincronização e o limpa quando a assinatura volta', async () => {
    const { result } = renderPicker(true);
    await act(async () => {});
    expect(result.current.syncError).toBeNull();

    act(() => { canalAtual!.callbacks[0]('CHANNEL_ERROR'); });
    expect(result.current.syncError).toBe('Não foi possível sincronizar o catálogo de áudios');

    act(() => { canalAtual!.callbacks[0]('SUBSCRIBED'); });
    expect(result.current.syncError).toBeNull();
  });

  it('evento tardio depois de fechar não refaz a busca (sem vazamento de canal)', async () => {
    const { rerender } = renderPicker(true);
    await act(async () => {});
    const canal1 = canalAtual!;

    rerender({ open: false });
    await act(async () => {});
    const chamadasAposFechar = mocks.rpc.mock.calls.length;

    // handler do canal antigo disparado depois do fechamento
    await act(async () => { canal1.handlers['audio_memes'].forEach((h) => h()); });

    expect(mocks.rpc).toHaveBeenCalledTimes(chamadasAposFechar);
    expect(mocks.removeChannel).toHaveBeenCalledWith(canal1);
  });

  it('picker fechado não abre canal nenhum', async () => {
    renderPicker(false);
    await act(async () => {});
    expect(mocks.channel).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });
});
