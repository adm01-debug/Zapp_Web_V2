/**
 * Item 069 (SL-210) — o SEGUNDO canal de upload de figurinha.
 *
 * A pasta pessoal (`PersonalStickers` → `usePersonalStickers.handleUpload`)
 * gravava no bucket `stickers` com `contentType: file.type` e a extensão do
 * arquivo escolhido, igual ao seletor do chat. Como o WhatsApp só aceita
 * figurinha em WebP (`docs/COMPLETE_SYSTEM_FEATURES.md:157`), a figurinha
 * pessoal escolhida como PNG ficava inválida para envio — corrigir só o
 * seletor deixaria este canal de fora.
 *
 * Prova: com as primitivas do navegador de imagem no lugar, o objeto que chega
 * ao bucket é `image/webp` num caminho `.webp`; a figurinha que já é WebP sobe
 * como veio, sem reencode.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const navegador = vi.hoisted(() => ({ decodificar: vi.fn(), desenhar: vi.fn(), codificar: vi.fn() }));

let inserted: Row[] = [];

/** Builder mínimo e THENABLE, como o PostgREST do supabase-js. */
function builder(tabela: string): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.maybeSingle = async () =>
    tabela === 'profiles' ? { data: { id: 'p-1', name: 'Ana' }, error: null } : { data: null, error: null };
  b.insert = async (payload: Row) => {
    inserted.push(payload);
    mocks.insert(payload);
    return { error: null };
  };
  b.then = (resolve: (valor: unknown) => unknown) => resolve({ data: [], error: null });
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => builder(tabela),
    auth: { getUser: mocks.getUser },
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: vi.fn(),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/stickers/${path}` },
        }),
      }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { usePersonalStickers } from '@/hooks/integrations/usePersonalStickers';

function criarWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function instalarNavegadorDeImagem() {
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
        return Promise.resolve(new Blob(['bytes-webp'], { type: opcoes.type }));
      }
    },
  );
}

function listaDeArquivos(file: File): FileList {
  return { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
}

async function enviarArquivo(file: File) {
  const { result } = renderHook(() => usePersonalStickers(), { wrapper: criarWrapper() });
  await waitFor(() => expect(result.current.profile?.id).toBe('p-1'));
  await act(async () => {
    await result.current.handleUpload(listaDeArquivos(file));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  navegador.decodificar.mockResolvedValue({ width: 512, height: 512, close: vi.fn() });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
  mocks.upload.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePersonalStickers — figurinha pessoal sobe em WebP (item 069)', () => {
  it('PNG escolhido na pasta pessoal vira image/webp no bucket', async () => {
    instalarNavegadorDeImagem();
    await enviarArquivo(new File(['x'], 'minha_foto.png', { type: 'image/png' }));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [caminho, arquivo, opcoes] = mocks.upload.mock.calls[0] as [string, File, { contentType: string }];
    // Antes da correção o caminho terminava em `.png` e o contentType era image/png.
    expect(caminho).toMatch(/^pessoal\/p-1\/[\w-]+\.webp$/);
    expect(arquivo.type).toBe('image/webp');
    expect(opcoes.contentType).toBe('image/webp');
    expect(navegador.codificar.mock.calls[0][0]).toMatchObject({ type: 'image/webp' });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ category: 'pessoal', owner_id: 'p-1', uploaded_by: 'p-1' });
  });

  it('figurinha que já é WebP sobe como veio, sem reencode', async () => {
    instalarNavegadorDeImagem();
    await enviarArquivo(new File(['x'], 'pronta.webp', { type: 'image/webp' }));

    const [caminho, , opcoes] = mocks.upload.mock.calls[0] as [string, File, { contentType: string }];
    expect(caminho).toMatch(/\.webp$/);
    expect(opcoes.contentType).toBe('image/webp');
    expect(navegador.decodificar).not.toHaveBeenCalled();
    expect(navegador.codificar).not.toHaveBeenCalled();
  });

  it('sem as primitivas de imagem o arquivo original segue (upload não é bloqueado)', async () => {
    await enviarArquivo(new File(['x'], 'minha_foto.png', { type: 'image/png' }));

    const [caminho, , opcoes] = mocks.upload.mock.calls[0] as [string, File, { contentType: string }];
    expect(caminho).toMatch(/\.png$/);
    expect(opcoes.contentType).toBe('image/png');
    expect(inserted).toHaveLength(1);
  });
});
