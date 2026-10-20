import type { MouseEvent as ReactMouseEvent } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-INB-042 (#336-A) — "áudio meme: categoria e exclusão conferem a escrita e não deixam
 * linha sem arquivo".
 *
 * Antes: `handleCategoryChange` aplicava a categoria no estado e anunciava
 * `toast.success('Categoria alterada')` sem olhar `error` nem as linhas afetadas; `handleDelete`
 * removia o OBJETO do bucket antes de apagar a LINHA e também não conferia resultado nenhum.
 * Resultado: a categoria parecia salva com a escrita rejeitada e, na remoção parcial (objeto
 * fora e `DELETE` falhando), a linha conservada passava a apontar para um arquivo inexistente.
 *
 * Aqui a prova é comportamental sobre o hook REAL (`renderHook`); só o cliente Supabase e o
 * `sonner` são simulados. Cada caminho de falha tem de: (a) não anunciar sucesso, (b) avisar o
 * erro, (c) devolver o item ao estado anterior — e o modo "0 linhas" (RLS filtra sem erro) é
 * tratado igual a um `error`.
 */

const memesDoBackend = [
  {
    id: 'meme-1', name: 'Primeiro',
    audio_url: 'https://cdn.test/storage/v1/object/public/audio-memes/meme-1.mp3',
    category: 'engracado', duration_seconds: 3, is_favorite: false, use_count: 0,
  },
  {
    id: 'meme-2', name: 'Segundo',
    audio_url: 'https://cdn.test/storage/v1/object/public/audio-memes/meme-2.mp3',
    category: 'engracado', duration_seconds: 4, is_favorite: false, use_count: 1,
  },
];

const h = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, rpc: h.rpc, storage: { from: h.storageFrom } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => h.logger,
  createLogger: () => h.logger,
  log: h.logger,
  logger: h.logger,
}));

import { toast } from 'sonner';
import { useAudioMemes, type AudioMemeItem } from '@/hooks/communication/useAudioMemes';

type Resposta = { data: unknown; error: unknown };

/** Cadeia `from('audio_memes').update(...)/delete(...).eq(...).select('id')` com resposta controlada. */
function cadeia(resposta: Resposta) {
  const select = vi.fn(() => Promise.resolve(resposta));
  const eq = vi.fn(() => ({ select }));
  return { eq, select };
}

/** Simula só as duas mutações do picker; qualquer outra tabela é erro de teste. */
function simularEscritas(overrides: { update?: Resposta; del?: Resposta }) {
  const updateCadeia = cadeia(overrides.update ?? { data: [{ id: 'meme-1' }], error: null });
  const deleteCadeia = cadeia(overrides.del ?? { data: [{ id: 'meme-1' }], error: null });
  const update = vi.fn(() => ({ eq: updateCadeia.eq }));
  const apagar = vi.fn(() => ({ eq: deleteCadeia.eq }));
  h.from.mockImplementation((tabela: string) => {
    if (tabela !== 'audio_memes') throw new Error(`tabela inesperada no teste: ${tabela}`);
    return { update, delete: apagar };
  });
  return { update, updateCadeia, apagar, deleteCadeia };
}

const meme = (id: string) => memesDoBackend.find((m) => m.id === id) as AudioMemeItem;
const eventoDeClique = () => ({ stopPropagation: vi.fn() } as unknown as ReactMouseEvent);
const categoriaDe = (memes: AudioMemeItem[], id: string) => memes.find((m) => m.id === id)?.category;

async function montar() {
  const utils = renderHook(() => useAudioMemes(true));
  await waitFor(() => expect(utils.result.current.memes).toHaveLength(2));
  return utils;
}

describe('useAudioMemes — categoria e exclusão conferem a escrita (R2-INB-042)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockReset();
    h.from.mockReset();
    h.storageFrom.mockReset();
    h.remove.mockReset();

    h.rpc.mockImplementation(async (nome: string) =>
      nome === 'fn_list_audio_memes_for_user'
        ? { data: memesDoBackend, error: null }
        : { data: null, error: null });
    h.storageFrom.mockImplementation(() => ({ remove: h.remove }));
    h.remove.mockResolvedValue({ data: [{ name: 'meme-1.mp3' }], error: null });
  });

  it('categoria: `update` com error não anuncia sucesso, avisa e devolve a categoria anterior', async () => {
    const { updateCadeia } = simularEscritas({
      update: { data: null, error: { message: 'new row violates row-level security policy' } },
    });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleCategoryChange(meme('meme-1'), 'alerta');
    });

    expect(updateCadeia.select).toHaveBeenCalledWith('id');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(categoriaDe(result.current.memes, 'meme-1')).toBe('engracado');
    // O outro item da lista não é tocado pelo revert.
    expect(categoriaDe(result.current.memes, 'meme-2')).toBe('engracado');
  });

  it('categoria: `update` sem error e 0 linhas (RLS filtrou) é falha igual ao erro', async () => {
    simularEscritas({ update: { data: [], error: null } });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleCategoryChange(meme('meme-1'), 'alerta');
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(categoriaDe(result.current.memes, 'meme-1')).toBe('engracado');
  });

  it('exclusão: `delete` com error mantém o item, não chama storage.remove e não anuncia sucesso', async () => {
    const { apagar } = simularEscritas({
      del: { data: null, error: { message: 'permission denied for table audio_memes' } },
    });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleDelete(eventoDeClique(), meme('meme-1'));
    });

    expect(apagar).toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(result.current.memes.map((m) => m.id)).toEqual(['meme-1', 'meme-2']);
  });

  it('exclusão: `delete` sem error e 0 linhas mantém o item e não chama storage.remove', async () => {
    simularEscritas({ del: { data: [], error: null } });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleDelete(eventoDeClique(), meme('meme-1'));
    });

    expect(h.remove).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(result.current.memes.map((m) => m.id)).toEqual(['meme-1', 'meme-2']);
  });

  it('exclusão: linha saiu e storage.remove falhou — nada de sucesso; a falha do objeto aparece', async () => {
    simularEscritas({ del: { data: [{ id: 'meme-1' }], error: null } });
    h.remove.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleDelete(eventoDeClique(), meme('meme-1'));
    });

    expect(h.remove).toHaveBeenCalledWith(['meme-1.mp3']);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalled();
    // A linha saiu: o item não volta à lista, mas o arquivo órfão é anunciado.
    expect(result.current.memes.map((m) => m.id)).toEqual(['meme-2']);
  });

  it('exclusão: caminho bom tira o item da lista, apaga o objeto e anuncia sucesso uma única vez', async () => {
    const { apagar } = simularEscritas({ del: { data: [{ id: 'meme-1' }], error: null } });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleDelete(eventoDeClique(), meme('meme-1'));
    });

    expect(apagar).toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledWith(['meme-1.mp3']);
    expect(result.current.memes.map((m) => m.id)).toEqual(['meme-2']);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    // Ordem exigida: a LINHA (`from('audio_memes')`) antes do objeto (`storage.remove`).
    expect(h.from.mock.invocationCallOrder[0]).toBeLessThan(h.remove.mock.invocationCallOrder[0]);
  });
});
