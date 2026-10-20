import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, act, waitFor, fireEvent, screen } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';

/**
 * Item 226 (auditoria V3 -> V2) — o seletor de emojis personalizados subia o arquivo
 * na RAIZ do bucket `custom-emojis` (`emoji_<ts>_<uuid>.png`). A policy de INSERT só
 * aceita admin/supervisor OU a pasta do próprio usuário, então o atendente COMUM
 * recebia erro de permissão e não conseguia enviar emoji.
 *
 * Este arquivo fixa, contra um FAKE COM ESTADO (não contra stubs que só gravam
 * chamadas): o objeto vai para `<auth.uid()>/<arquivo>`; cancelar (e fechar o
 * popover com prévia pendente) remove o objeto, sem órfão; o Salvar é idempotente
 * (duplo clique = 1 linha) e exige nome não vazio; o envio sobe `use_count` pela RPC
 * `increment_custom_emoji_use` e trata o erro.
 *
 * O fake abaixo é a fronteira módulo `client` (sem backend no vitest): ele GUARDA
 * objetos (`bucket/caminho`) e linhas, então cada asserção lê ESTADO — caminho real
 * construído pelo hook, objeto presente/ausente de verdade, 1 linha de verdade,
 * contador subido de verdade. Nada aqui afirma `toHaveBeenCalledWith`: se o hook
 * voltasse a subir na raiz, a chave sem uid estaria no Map e o teste falharia.
 */

const BUCKET = 'custom-emojis';
const UID_A = 'user-atendente-1';
const UID_B = 'user-atendente-2';
const BASE = 'https://proj.supabase.co/storage/v1/object/public/custom-emojis/';

type Row = Record<string, unknown>;

const fake = vi.hoisted(() => ({
  sessionUid: null as string | null,
  objects: new Map<string, { contentType: string }>(),
  rows: [] as Row[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcError: null as { message: string } | null,
  classifyCategory: 'produto',
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

function resetFake() {
  fake.sessionUid = UID_A;
  fake.objects.clear();
  fake.rows.length = 0;
  fake.rpcCalls.length = 0;
  fake.rpcError = null;
  fake.classifyCategory = 'produto';
  fake.toastError.mockClear();
  fake.toastSuccess.mockClear();
  fake.toastInfo.mockClear();
}

function seedEmoji(overrides: Row = {}): Row {
  const row: Row = {
    id: 'emoji-1',
    name: 'Festa',
    image_url: `${BASE}${UID_A}/emoji_1.png`,
    category: 'outros',
    is_favorite: false,
    use_count: 0,
    uploaded_by: UID_A,
    ...overrides,
  };
  fake.rows.push(row);
  return row;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: fake.sessionUid ? { id: fake.sessionUid } : null },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: unknown, opts?: { contentType?: string }) => {
          fake.objects.set(`${bucket}/${path}`, { contentType: opts?.contentType ?? '' });
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) fake.objects.delete(`${bucket}/${p}`);
          return { data: null, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}${path}` } }),
      }),
    },
    from: (_table: string) => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: fake.rows.map((r) => ({ ...r })), error: null }),
        }),
      }),
      insert: async (payload: Row) => {
        fake.rows.push({ ...payload, id: `emoji-${fake.rows.length + 1}` });
        return { data: null, error: null };
      },
      update: (patch: Row) => ({
        eq: async (col: string, val: unknown) => {
          for (const r of fake.rows) if (r[col] === val) Object.assign(r, patch);
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (col: string, val: unknown) => {
          for (let i = fake.rows.length - 1; i >= 0; i--) {
            if (fake.rows[i][col] === val) fake.rows.splice(i, 1);
          }
          return { error: null };
        },
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ name, args });
      if (fake.rpcError) return { data: null, error: fake.rpcError };
      const row = fake.rows.find((r) => r.id === args.p_emoji_id);
      const next = ((row?.use_count as number | undefined) ?? 0) + 1;
      if (row) row.use_count = next;
      return { data: next, error: null };
    },
    functions: {
      invoke: async () => ({ data: { category: fake.classifyCategory }, error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => (fake.toastSuccess as (...a: unknown[]) => void)(...args),
    error: (...args: unknown[]) => (fake.toastError as (...a: unknown[]) => void)(...args),
    info: (...args: unknown[]) => (fake.toastInfo as (...a: unknown[]) => void)(...args),
  },
}));

import { useCustomEmojis, type CustomEmoji, type PendingEmojiUpload } from '../useCustomEmojis';
import { CustomEmojiPicker } from '../../../components/inbox/CustomEmojiPicker';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeEach(() => {
  resetFake();
});

function fileList(name: string): FileList {
  const file = new File(['x'], name, { type: 'image/png' });
  return { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
}

function changeEvent(name: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { files: fileList(name) } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

async function montar() {
  const view = renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
  await waitFor(() => expect(view.result.current.emojis).toHaveLength(1));
  return view;
}

function objectKeys(): string[] {
  return [...fake.objects.keys()];
}

describe('useCustomEmojis — caminho de upload na pasta do usuário (item 226)', () => {
  it('atendente comum sobe o objeto em <uid>/<arquivo> (nada na raiz)', async () => {
    seedEmoji();
    const { result } = await montar();

    await act(async () => {
      await result.current.handleFileSelect(changeEvent('festa.png'));
    });

    const keys = objectKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(`${BUCKET}/${UID_A}/emoji_`)).toBe(true);
    expect(keys[0].endsWith('.png')).toBe(true);
    // a prévia carrega o MESMO caminho, para a limpeza acertar o objeto
    const storagePath = keys[0].slice(BUCKET.length + 1);
    expect(result.current.pendingUpload?.storagePath).toBe(storagePath);
    expect(result.current.pendingUpload?.imageUrl).toBe(`${BASE}${storagePath}`);
    expect(fake.toastError).not.toHaveBeenCalled();
  });

  it('o caminho segue a sessão (uid varia, storage filtrável)', async () => {
    seedEmoji();
    fake.sessionUid = UID_B;
    const { result } = await montar();

    await act(async () => {
      await result.current.handleFileSelect(changeEvent('festa.png'));
    });

    const keys = objectKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(`${BUCKET}/${UID_B}/emoji_`)).toBe(true);
    expect(keys.some((k) => k.includes(UID_A))).toBe(false);
  });

  it('sem sessão não sobe arquivo e avisa (nenhum objeto anônimo)', async () => {
    seedEmoji();
    fake.sessionUid = null;
    const { result } = await montar();

    await act(async () => {
      await result.current.handleFileSelect(changeEvent('festa.png'));
    });

    expect(objectKeys()).toHaveLength(0);
    expect(result.current.pendingUpload).toBeNull();
    expect(fake.toastError).toHaveBeenCalledTimes(1);
  });

  it('cancelar a prévia remove o objeto (não deixa órfão)', async () => {
    seedEmoji();
    const view = await montar();

    await act(async () => {
      await view.result.current.handleFileSelect(changeEvent('festa.png'));
    });
    expect(objectKeys()).toHaveLength(1);

    await act(async () => {
      await view.result.current.handleCancelUpload();
    });

    expect(objectKeys()).toHaveLength(0);
    expect(view.result.current.pendingUpload).toBeNull();
  });
});

describe('useCustomEmojis — Salvar (item 226)', () => {
  function pendente(overrides: Partial<PendingEmojiUpload> = {}): PendingEmojiUpload {
    return {
      file: new File(['x'], 'festa.png', { type: 'image/png' }),
      imageUrl: `${BASE}${UID_A}/emoji_1.png`,
      storagePath: `${UID_A}/emoji_1.png`,
      aiCategory: 'outros',
      selectedCategory: 'outros',
      name: 'Festa',
      ...overrides,
    };
  }

  it('duplo clique cria UMA linha só', async () => {
    seedEmoji();
    const { result } = await montar();
    const antes = fake.rows.length;

    await act(async () => {
      await Promise.all([
        result.current.handleConfirmUpload(pendente()),
        result.current.handleConfirmUpload(pendente()),
      ]);
    });

    expect(fake.rows.length).toBe(antes + 1);
    expect(result.current.pendingUpload).toBeNull();
    expect(fake.toastError).not.toHaveBeenCalled();
  });

  it('nome vazio (ou só espaços) é barrado antes do insert', async () => {
    seedEmoji();
    const { result } = await montar();
    const antes = fake.rows.length;

    await act(async () => {
      await result.current.handleConfirmUpload(pendente({ name: '   ' }));
    });

    expect(fake.rows.length).toBe(antes);
    expect(fake.toastError).toHaveBeenCalledTimes(1);
  });

  it('o nome é salvo com trim', async () => {
    seedEmoji();
    const { result } = await montar();

    await act(async () => {
      await result.current.handleConfirmUpload(pendente({ name: '  Festa  ' }));
    });

    const nova = fake.rows[fake.rows.length - 1];
    expect(nova.name).toBe('Festa');
    expect(nova.uploaded_by).toBe(UID_A);
  });
});

describe('useCustomEmojis — envio conta o uso pela RPC (PB-35)', () => {
  it('handleSend chama increment_custom_emoji_use e o contador sobe no estado', async () => {
    seedEmoji({ use_count: 3 });
    const { result } = await montar();
    const onSendEmoji = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      await result.current.handleSend(result.current.emojis[0], onSendEmoji, onClose);
    });

    expect(onSendEmoji).toHaveBeenCalledWith(`${BASE}${UID_A}/emoji_1.png`);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toEqual({
      name: 'increment_custom_emoji_use',
      args: { p_emoji_id: 'emoji-1' },
    });
    expect(fake.rows.find((r) => r.id === 'emoji-1')?.use_count).toBe(4);
    expect(fake.toastError).not.toHaveBeenCalled();
  });

  it('erro na RPC avisa o usuário (não engole o erro)', async () => {
    seedEmoji();
    fake.rpcError = { message: 'permission denied' };
    const { result } = await montar();

    await act(async () => {
      await result.current.handleSend(result.current.emojis[0], vi.fn(), vi.fn());
    });

    expect(fake.toastError).toHaveBeenCalledTimes(1);
  });
});

describe('CustomEmojiPicker — fechar com prévia pendente não deixa órfão (item 226)', () => {
  it('fechar o popover com prévia pendente remove o objeto do Storage', async () => {
    seedEmoji();
    render(createElement(TooltipProvider, null, createElement(CustomEmojiPicker, { onSendEmoji: vi.fn() })));

    fireEvent.click(screen.getByRole('button', { name: 'Emojis Personalizados' }));
    fireEvent.click(await screen.findByText('Customizados'));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: fileList('festa.png') } });
    });

    await waitFor(() => expect(objectKeys()).toHaveLength(1));
    await screen.findByPlaceholderText('Nome do emoji');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(objectKeys()).toHaveLength(0));
  });
});
