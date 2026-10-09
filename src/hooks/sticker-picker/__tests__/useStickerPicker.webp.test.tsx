/**
 * Item 069 do bloco 065-070 (SL-210) — a figurinha escolhida como PNG era
 * subida ao bucket `stickers` com os bytes e o MIME ORIGINAIS.
 *
 * O seletor aceita `image/webp,image/png,image/gif,image/jpeg`
 * (src/components/inbox/StickerPicker.tsx:54), mas o WhatsApp só aceita
 * figurinha em WebP (`docs/COMPLETE_SYSTEM_FEATURES.md:157` — "Stickers: WebP
 * (max 100KB)") e a Evolution GO recusa o envio do objeto quando ele não é
 * WebP. O PNG entrava na biblioteca com `sticker_..._<uuid>.png` +
 * `contentType: image/png` e só falhava no envio.
 *
 * Prova: com o seletor REAL e as primitivas do navegador de imagem
 * (`createImageBitmap` + `OffscreenCanvas`) no lugar, o objeto que chega ao
 * bucket tem de ser `image/webp` num caminho `.webp`; a figurinha que JÁ é WebP
 * não pode ser reencodada (não se perde qualidade à toa).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  invoke: vi.fn(),
  tableFrom: vi.fn(),
  getUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

/** Primitivas do navegador observadas pelo teste (decode + encode WebP). */
const navegador = vi.hoisted(() => ({
  decodificar: vi.fn(),
  desenhar: vi.fn(),
  codificar: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    functions: { invoke: mocks.invoke },
    from: mocks.tableFrom,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));

import { useStickerPicker } from '../useStickerPicker';

/** `createImageBitmap`/`OffscreenCanvas` no lugar (jsdom não tem nenhum dos dois). */
function instalarNavegadorDeImagem(tipoCodificado: string = 'image/webp') {
  vi.stubGlobal('createImageBitmap', navegador.decodificar);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage: navegador.desenhar };
      }
      convertToBlob(opcoes: { type?: string; quality?: number }) {
        navegador.codificar(opcoes, this.width, this.height);
        return Promise.resolve(new Blob(['bytes-webp'], { type: tipoCodificado }));
      }
    },
  );
}

function eventoDeArquivo(nome: string, tipo: string): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['bytes-da-figurinha'], nome, { type: tipo });
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

function tableChain() {
  const selectChain = {
    order: () => selectChain,
    range: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    select: () => selectChain,
    insert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
    getPublicUrl: (path: string) => mocks.getPublicUrl(bucket, path),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.remove.mockResolvedValue({ data: null, error: null });
  mocks.getPublicUrl.mockImplementation((bucket: string, path: string) => ({
    data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
  }));
  mocks.invoke.mockResolvedValue({ data: { category: 'enviadas' }, error: null });
  mocks.tableFrom.mockImplementation(() => tableChain());
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  navegador.decodificar.mockResolvedValue({ width: 300, height: 300, close: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStickerPicker — figurinha sobe em WebP (item 069)', () => {
  it('PNG escolhido sobe como image/webp num caminho .webp', async () => {
    instalarNavegadorDeImagem();
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });

    await act(async () => { result.current.handleFileSelect(eventoDeArquivo('figurinha.png', 'image/png')); });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [, caminho, arquivo, opcoes] = mocks.upload.mock.calls[0] as [string, string, File, { contentType: string }];
    // Antes da correção o caminho terminava em `.png` e o contentType era image/png.
    expect(caminho).toMatch(/^sticker_\d+_[\w-]+\.webp$/);
    expect(opcoes.contentType).toBe('image/webp');
    expect(arquivo.type).toBe('image/webp');
    // O encode foi pedido em WebP — e é o arquivo convertido que fica no preview.
    expect(navegador.codificar.mock.calls[0][0]).toMatchObject({ type: 'image/webp' });
    expect(result.current.pendingUpload?.file.type).toBe('image/webp');
  });

  it('JPEG escolhido também sobe em WebP', async () => {
    instalarNavegadorDeImagem();
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });

    await act(async () => { result.current.handleFileSelect(eventoDeArquivo('foto.jpeg', 'image/jpeg')); });

    const [, caminho, , opcoes] = mocks.upload.mock.calls[0] as [string, string, File, { contentType: string }];
    expect(caminho).toMatch(/\.webp$/);
    expect(opcoes.contentType).toBe('image/webp');
  });

  it('figurinha que JÁ é WebP não é reencodada (qualidade preservada)', async () => {
    instalarNavegadorDeImagem();
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });

    await act(async () => { result.current.handleFileSelect(eventoDeArquivo('pronta.webp', 'image/webp')); });

    const [, caminho, , opcoes] = mocks.upload.mock.calls[0] as [string, string, File, { contentType: string }];
    expect(caminho).toMatch(/\.webp$/);
    expect(opcoes.contentType).toBe('image/webp');
    expect(navegador.decodificar).not.toHaveBeenCalled();
    expect(navegador.codificar).not.toHaveBeenCalled();
  });

  it('GIF continua subindo como veio (animação não se perde sem lib nova)', async () => {
    instalarNavegadorDeImagem();
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });

    await act(async () => { result.current.handleFileSelect(eventoDeArquivo('animada.gif', 'image/gif')); });

    const [, caminho, , opcoes] = mocks.upload.mock.calls[0] as [string, string, File, { contentType: string }];
    expect(caminho).toMatch(/\.gif$/);
    expect(opcoes.contentType).toBe('image/gif');
    expect(navegador.codificar).not.toHaveBeenCalled();
  });
});
