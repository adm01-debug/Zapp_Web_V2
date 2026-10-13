import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, act, waitFor, fireEvent, screen } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';

/**
 * Item 226 (auditoria V3 -> V2) — o seletor de emojis personalizados subia o arquivo
 * na RAIZ do bucket `custom-emojis` (`emoji_<ts>_<uuid>.png`). A policy de INSERT só
 * aceita admin/supervisor OU a pasta do próprio usuário, então o atendente COMUM
 * recebia erro de permissão e não conseguia enviar emoji. O mesmo caminho raiz também
 * deixava o objeto fora da pasta do dono, que é a única onde o DELETE vale.
 *
 * Este arquivo fixa: o objeto vai para `<auth.uid()>/<arquivo>`; cancelar (e fechar o
 * popover com prévia pendente) remove o objeto, sem órfão; o Salvar é idempotente
 * (duplo clique = 1 linha) e exige nome não vazio; o envio sobe `use_count` pela RPC
 * `increment_custom_emoji_use` e trata o erro.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  rpc: vi.fn(),
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
    rpc: mocks.rpc,
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
import { CustomEmojiPicker } from '@/components/inbox/CustomEmojiPicker';
import { TooltipProvider } from '@/components/ui/tooltip';

const BUCKET = 'custom-emojis';
const UID = 'user-atendente-1';
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

const click = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
let inserted: Record<string, unknown>[] = [];
let insertError: { message: string } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  insertError = null;
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { category: 'produto' }, error: null });
  mocks.rpc.mockResolvedValue({ data: 4, error: null });
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [emoji()], error: null }) }) }),
    insert: (payload: Record<string, unknown>) => {
      inserted.push(payload);
      return Promise.resolve({ error: insertError });
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

function fileList(name: string): FileList {
  const file = new File(['x'], name, { type: 'image/png' });
  return { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
}

async function montar() {
  const view = renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
  await waitFor(() => expect(view.result.current.emojis).toHaveLength(1));
  return view;
}

describe('useCustomEmojis — caminho de upload na pasta do usuário (item 226)', () => {
  it('atendente comum sobe o objeto em <uid>/<arquivo> (não na raiz)', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.handleFileSelect({ target: { files: fileList('festa.png') } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    const [bucket, path] = mocks.storageUpload.mock.calls[0];
    expect(bucket).toBe(BUCKET);
    expect(path.startsWith(`${UID}/emoji_`)).toBe(true);
    expect(path.endsWith('.png')).toBe(true);
    // a prévia carrega o MESMO caminho, para a limpeza acertar o objeto
    expect(result.current.pendingUpload?.storagePath).toBe(path);
    expect(result.current.pendingUpload?.imageUrl).toBe(`${BASE}${path}`);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('sem sessão não sobe arquivo e avisa (nada de objeto anônimo na raiz)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleFileSelect({ target: { files: fileList('festa.png') } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('cancelar a prévia remove o objeto (não deixa órfão)', async () => {
    const view = await montar();

    await act(async () => {
      await view.result.current.handleFileSelect({ target: { files: fileList('festa.png') } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    const path = view.result.current.pendingUpload?.storagePath as string;

    await act(async () => {
      await view.result.current.handleCancelUpload();
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(BUCKET, [path]);
    expect(view.result.current.pendingUpload).toBeNull();
  });
});

describe('useCustomEmojis — Salvar (item 226)', () => {
  function pendente(overrides: Partial<PendingEmojiUpload> = {}): PendingEmojiUpload {
    return {
      file: new File(['x'], 'festa.png', { type: 'image/png' }),
      imageUrl: `${BASE}${UID}/emoji_1.png`,
      storagePath: `${UID}/emoji_1.png`,
      aiCategory: 'outros',
      selectedCategory: 'outros',
      name: 'Festa',
      ...overrides,
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
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('nome vazio (ou só espaços) é barrado antes do insert', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.handleConfirmUpload(pendente({ name: '   ' }));
    });

    expect(inserted).toHaveLength(0);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('o nome é salvo com trim', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.handleConfirmUpload(pendente({ name: '  Festa  ' }));
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ name: 'Festa', uploaded_by: UID });
  });
});

describe('useCustomEmojis — envio conta o uso pela RPC (PB-35)', () => {
  it('handleSend chama increment_custom_emoji_use com o id do emoji', async () => {
    const { result } = await montar();
    const onSendEmoji = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      await result.current.handleSend(result.current.emojis[0], onSendEmoji, onClose);
    });

    expect(onSendEmoji).toHaveBeenCalledWith(`${BASE}${UID}/emoji_1.png`);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('increment_custom_emoji_use', { p_emoji_id: 'emoji-1' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('erro na RPC avisa o usuário (não engole o erro)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = await montar();

    await act(async () => {
      await result.current.handleSend(result.current.emojis[0], vi.fn(), vi.fn());
    });

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});

describe('CustomEmojiPicker — fechar com prévia pendente não deixa órfão (item 226)', () => {
  it('fechar o popover com prévia pendente remove o objeto do Storage', async () => {
    render(createElement(TooltipProvider, null, createElement(CustomEmojiPicker, { onSendEmoji: vi.fn() })));

    fireEvent.click(screen.getByRole('button', { name: 'Emojis Personalizados' }));
    fireEvent.click(await screen.findByText('Customizados'));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: fileList('festa.png') } });
    });

    await waitFor(() => expect(mocks.storageUpload).toHaveBeenCalledTimes(1));
    const path = mocks.storageUpload.mock.calls[0][1] as string;
    await screen.findByPlaceholderText('Nome do emoji');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(mocks.storageRemove).toHaveBeenCalledWith(BUCKET, [path]));
  });
});
