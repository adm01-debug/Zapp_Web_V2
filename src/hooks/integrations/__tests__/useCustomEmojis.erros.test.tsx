import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type React from 'react';

/**
 * [refazer 1] (14/10/2026) — pontos 1 e 2 da recusa do revisor:
 * 1. erro de envio do hook ia só para o toast; agora também preenche
 *    `uploadError`, que o seletor mostra na tela com "Tentar novamente".
 * 2. `fetchEmojis` lia só os 500 primeiros (`.limit(500)`, sem desempate):
 *    agora ordena por `use_count` + `id` e pagina com `range()` + "Carregar mais".
 *
 * O teste chama o código real do hook, com o cliente Supabase mockado.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.tableFrom,
    storage: { from: mocks.storageFrom },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
    info: mocks.toastInfo,
  },
}));

import { useCustomEmojis, type CustomEmoji } from '../useCustomEmojis';

const BUCKET = 'custom-emojis';
const BASE = 'https://proj.supabase.co/storage/v1/object/public/custom-emojis/';

function emoji(overrides: Partial<CustomEmoji> = {}): CustomEmoji {
  return {
    id: 'emoji-1',
    name: 'Festa',
    image_url: `${BASE}user-1/emoji_1.png`,
    category: 'outros',
    is_favorite: false,
    use_count: 0,
    ...overrides,
  };
}

// Páginas que a "tabela" devolve, na ordem das chamadas a range().
let paginas: { data: CustomEmoji[]; error: { message: string } | null }[] = [];
const orderChamadas: Array<[string, unknown]> = [];
const rangeChamadas: Array<[number, number]> = [];

beforeEach(() => {
  vi.clearAllMocks();
  paginas = [];
  orderChamadas.length = 0;
  rangeChamadas.length = 0;
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({
      order: (coluna: string, opcoes: unknown) => {
        orderChamadas.push([coluna, opcoes]);
        return {
          order: (coluna2: string, opcoes2: unknown) => {
            orderChamadas.push([coluna2, opcoes2]);
            return {
              range: (de: number, ate: number) => {
                rangeChamadas.push([de, ate]);
                const pagina = paginas.shift() ?? { data: [], error: null };
                return Promise.resolve(pagina);
              },
            };
          },
        };
      },
    }),
    insert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
  mocks.storageFrom.mockImplementation(() => ({
    upload: (...args: unknown[]) => mocks.storageUpload(...args),
    remove: () => Promise.resolve({ data: null, error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}${path}` } }),
  }));
  mocks.storageUpload.mockResolvedValue({ error: null });
});

function fileList(name: string): FileList {
  const file = new File(['x'], name, { type: 'image/png' });
  return { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
}

async function montarCom(paginaInicial: CustomEmoji[]) {
  paginas = [{ data: paginaInicial, error: null }];
  const view = renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
  await waitFor(() => expect(rangeChamadas.length).toBeGreaterThan(0));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useCustomEmojis — erro visível e paginação ([refazer 1])', () => {
  it('busca ordena por use_count e desempatada por id, em páginas de 500', async () => {
    await montarCom([emoji()]);

    expect(orderChamadas).toEqual([
      ['use_count', { ascending: false }],
      ['id', { ascending: true }],
    ]);
    expect(rangeChamadas).toEqual([[0, 499]]);
  });

  it('página cheia liga "há mais"; carregar mais anexa sem trocar a ordem', async () => {
    const primeira = Array.from({ length: 500 }, (_, i) =>
      emoji({ id: `e-${i}`, name: `E${i}`, use_count: 500 - i }),
    );
    const segunda = [emoji({ id: 'e-500', name: 'E500', use_count: 0 })];
    const view = await montarCom(primeira);
    expect(view.result.current.hasMore).toBe(true);

    paginas = [{ data: segunda, error: null }];
    await act(async () => {
      await view.result.current.loadMore();
    });

    expect(rangeChamadas).toEqual([[0, 499], [500, 999]]);
    expect(view.result.current.emojis).toHaveLength(501);
    expect(view.result.current.emojis[500].id).toBe('e-500');
    // página curta: acabou
    expect(view.result.current.hasMore).toBe(false);
  });

  it('dois toques no "carregar mais" disparam uma única página', async () => {
    const primeira = Array.from({ length: 500 }, (_, i) => emoji({ id: `e-${i}` }));
    const view = await montarCom(primeira);
    paginas = [{ data: [emoji({ id: 'e-500' })], error: null }];

    await act(async () => {
      await Promise.all([view.result.current.loadMore(), view.result.current.loadMore()]);
    });

    expect(rangeChamadas).toEqual([[0, 499], [500, 999]]);
    expect(view.result.current.emojis).toHaveLength(501);
  });

  it('falha no "carregar mais" avisa e mantém a lista intacta', async () => {
    const view = await montarCom(Array.from({ length: 500 }, (_, i) => emoji({ id: `e-${i}` })));
    paginas = [{ data: [], error: { message: 'rede caiu' } }];

    await act(async () => {
      await view.result.current.loadMore();
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível carregar mais emojis');
    expect(view.result.current.emojis).toHaveLength(500);
    expect(view.result.current.loadingMore).toBe(false);
  });

  it('falha no envio preenche o erro da tela (além do toast) e próxima tentativa limpa', async () => {
    const view = await montarCom([]);
    mocks.storageUpload.mockResolvedValue({ error: { message: 'sem permissão' } });

    await act(async () => {
      await view.result.current.handleFileSelect({
        target: { files: fileList('festa.png') },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao enviar arquivo');
    expect(view.result.current.uploadError).toBe('Erro ao enviar arquivo');
    expect(view.result.current.pendingUpload).toBeNull();

    // próxima tentativa começa sem o erro anterior
    mocks.storageUpload.mockResolvedValue({ error: null });
    await act(async () => {
      await view.result.current.handleFileSelect({
        target: { files: fileList('festa.png') },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(view.result.current.uploadError).toBeNull();
    expect(view.result.current.pendingUpload).not.toBeNull();
  });

  it('arquivo inválido também aparece na tela (não só no toast)', async () => {
    const view = await montarCom([]);
    const texto = new File(['x'], 'nota.txt', { type: 'text/plain' });
    const lista = { 0: texto, length: 1, item: () => texto } as unknown as FileList;

    await act(async () => {
      await view.result.current.handleFileSelect({
        target: { files: lista },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(view.result.current.uploadError).toBe('Arquivo não é uma imagem válida');
  });
});
