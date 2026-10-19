import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type React from 'react';

/**
 * Cobertura de comportamento do `useCustomEmojis` para o caminho de envio (paridade
 * V3 -> V2, docs 02/03). O arquivo existente (`useCustomEmojis.persistencia.test.tsx`)
 * só cobria favorito, categoria e exclusão; aqui ficam presos os demais efeitos
 * observáveis do hook, exercitando o hook REAL com a fronteira (Supabase/Storage/sonner)
 * dublada:
 *  - arquivo que não é imagem é barrado (avisa e NÃO toca o Storage);
 *  - arquivo acima de 512KB é barrado (idem), com o teto medido pelo lado de dentro
 *    (exatamente 512KB ainda passa);
 *  - upload vai para `<auth.uid()>/<arquivo>`, o mesmo caminho da prévia pendente;
 *  - cancelar a prévia remove o objeto do Storage (sem órfão);
 *  - duplo clique no Salvar cria UMA linha só;
 *  - falha do bucket mostra erro ao usuário (nada de sucesso silencioso).
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  getUser: vi.fn(),
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.tableFrom,
    storage: { from: mocks.storageFrom },
    auth: { getUser: mocks.getUser },
    functions: { invoke: mocks.invoke },
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

import { useCustomEmojis, type CustomEmoji, type PendingEmojiUpload } from '../useCustomEmojis';

const BUCKET = 'custom-emojis';
const UID = 'user-atendente-1';
const TETO = 512 * 1024;
const BASE = 'https://proj.supabase.co/storage/v1/object/public/custom-emojis/';

function emoji(overrides: Partial<CustomEmoji> = {}): CustomEmoji {
  return {
    id: 'emoji-1',
    name: 'Festa',
    image_url: `${BASE}${UID}/emoji_1.png`,
    category: 'outros',
    is_favorite: false,
    use_count: 0,
    ...overrides,
  };
}

let inserted: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { category: 'produto' }, error: null });
  mocks.tableFrom.mockImplementation(() => ({
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.order = () => chain;
      chain.range = () => Promise.resolve({ data: [emoji()], error: null });
      chain.limit = () => Promise.resolve({ data: [emoji()], error: null });
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      inserted.push(payload);
      return Promise.resolve({ error: null });
    },
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.storageUpload(bucket, path, file, opts),
    remove: (paths: string[]) => mocks.storageRemove(bucket, paths),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}${path}` } }),
  }));
  mocks.storageUpload.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
});

function arquivo(nome: string, tipo: string, bytes: number): FileList {
  const file = new File([new Uint8Array(bytes)], nome, { type: tipo });
  return { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
}

async function montar() {
  const view = renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
  await waitFor(() => expect(view.result.current.emojis).toHaveLength(1));
  return view;
}

async function selecionar(files: FileList) {
  const view = await montar();
  await act(async () => {
    await view.result.current.handleFileSelect({ target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
  return view;
}

describe('useCustomEmojis.upload — validação do arquivo', () => {
  it('arquivo que não é imagem é barrado antes do Storage', async () => {
    const view = await selecionar(arquivo('contrato.pdf', 'application/pdf', 100));

    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(view.result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('Arquivo não é uma imagem válida');
  });

  it('imagem acima de 512KB é barrada antes do Storage', async () => {
    const view = await selecionar(arquivo('grande.png', 'image/png', TETO + 1));

    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(view.result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('Arquivo excede 512KB');
  });

  it('imagem de exatamente 512KB passa (o teto é >512KB, não >=)', async () => {
    const view = await selecionar(arquivo('no-limite.png', 'image/png', TETO));

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    expect(view.result.current.pendingUpload).not.toBeNull();
  });
});

describe('useCustomEmojis.upload — upload, cancelamento e falha', () => {
  it('sobe o objeto para <uid>/<arquivo> e a prévia aponta para o mesmo caminho', async () => {
    const view = await selecionar(arquivo('festa.png', 'image/png', 100));

    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    const [bucket, path] = mocks.storageUpload.mock.calls[0];
    expect(bucket).toBe(BUCKET);
    expect((path as string).startsWith(`${UID}/emoji_`)).toBe(true);
    expect((path as string).endsWith('.png')).toBe(true);
    expect(view.result.current.pendingUpload?.storagePath).toBe(path);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('falha do bucket mostra erro e não deixa prévia pendente', async () => {
    mocks.storageUpload.mockResolvedValue({ error: { message: 'permission denied' } });
    const view = await selecionar(arquivo('festa.png', 'image/png', 100));

    expect(view.result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao enviar arquivo');
  });

  it('cancelar a prévia remove o objeto do Storage (sem órfão)', async () => {
    const view = await selecionar(arquivo('festa.png', 'image/png', 100));
    const path = view.result.current.pendingUpload?.storagePath as string;

    await act(async () => {
      await view.result.current.handleCancelUpload();
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(BUCKET, [path]);
    expect(view.result.current.pendingUpload).toBeNull();
  });
});

describe('useCustomEmojis.upload — Salvar (duplo clique)', () => {
  function pendente(): PendingEmojiUpload {
    return {
      file: new File(['x'], 'festa.png', { type: 'image/png' }),
      imageUrl: `${BASE}${UID}/emoji_1.png`,
      storagePath: `${UID}/emoji_1.png`,
      aiCategory: 'outros',
      selectedCategory: 'outros',
      name: 'Festa',
    };
  }

  it('duplo clique cria UMA linha só', async () => {
    const { result } = await montar();

    await act(async () => {
      await Promise.all([
        result.current.handleConfirmUpload(pendente()),
        result.current.handleConfirmUpload(pendente()),
      ]);
    });

    expect(inserted).toHaveLength(1);
    expect(result.current.pendingUpload).toBeNull();
  });
});
