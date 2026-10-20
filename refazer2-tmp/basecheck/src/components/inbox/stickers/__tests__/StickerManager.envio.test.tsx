import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R2-INB-063 — no ADMINISTRADOR de figurinhas compartilhadas o botão "+" não abria
 * nada: `onAddClick` só exibia um toast mandando usar "o botão de upload na barra de
 * ferramentas", que não existia. O `pendingUpload` do arquivo era estado morto — nunca
 * havia upload, revisão com nome/categoria nem gravação da linha, e o `onConfirm`
 * mostrava "salva!" só com `invalidateQueries`, sem escrever nada no banco.
 *
 * Este arquivo fixa o contrato: o "+" envia a imagem (WebP), mostra a revisão e SÓ
 * então grava a linha; erro de gravação NÃO vira sucesso; cancelar desfaz o envio;
 * o contador de uso é aguardado e consumido; a consulta com erro oferece "Tentar de
 * novo"; e os botões de tamanho da grade têm rótulo acessível.
 *
 * O teste RENDERIZA o StickerManager real; só o cliente do Supabase, o toast e o
 * conversor WebP (fronteira de API do navegador, já provado em
 * useStickerPicker.webp.test) são falsos.
 */

type Row = Record<string, unknown>;

const UID = 'user-admin';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

const imageMocks = vi.hoisted(() => ({
  precisaConverterParaWebp: vi.fn(),
  converterFigurinhaParaWebp: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  /** disparado só quando alguém aguarda/encadeia o builder de UPDATE */
  consumedUpdate: vi.fn(),
}));

let PROFILE_ROWS: Row[] = [];
let STICKER_ROWS: Row[] = [];
let inserts: Row[] = [];
let updates: Row[] = [];
let insertError: { message: string } | null = null;
let updateError: { message: string } | null = null;
let updateRows: Row[] | null = [{ id: 's1' }];
let readError: { message: string } | null = null;

function tableRows(table: string): Row[] {
  if (table === 'profiles') return PROFILE_ROWS;
  if (table === 'stickers') return STICKER_ROWS;
  throw new Error(`tabela inesperada no teste: ${table}`);
}

type Op = 'select' | 'insert' | 'update' | 'delete';

function makeBuilder(table: string) {
  const filters: Array<[string, unknown]> = [];
  const op: { current: Op } = { current: 'select' };

  const apply = () => {
    let rows = tableRows(table).slice();
    for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
    return rows;
  };

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val]);
    return builder;
  });
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn(async () => ({ data: apply(), error: null }));
  builder.maybeSingle = vi.fn(async () => {
    const rows = apply();
    return { data: rows[0] ?? null, error: null };
  });
  builder.insert = vi.fn((payload: Row) => {
    op.current = 'insert';
    inserts.push(payload);
    return builder;
  });
  builder.update = vi.fn((payload: Row) => {
    op.current = 'update';
    updates.push(payload);
    return builder;
  });
  builder.delete = vi.fn(() => {
    op.current = 'delete';
    return builder;
  });
  // O builder do PostgREST é "thenable": a resposta só é produzida quando alguém
  // aguarda/encadeia (`.then`). Um update disparado sem await nunca passa por aqui.
  builder.then = (resolve: (value: unknown) => unknown) => {
    if (op.current === 'update') {
      mocks.consumedUpdate();
      return Promise.resolve({ data: updateError ? null : updateRows, error: updateError }).then(resolve);
    }
    if (op.current === 'insert') {
      return Promise.resolve({ data: insertError ? null : [{ id: 'novo' }], error: insertError }).then(resolve);
    }
    if (op.current === 'delete') {
      return Promise.resolve({ data: [{ id: 's1' }], error: null }).then(resolve);
    }
    return Promise.resolve({ data: readError ? null : apply(), error: readError }).then(resolve);
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    auth: { getUser: mocks.getUser },
    storage: { from: storageMocks.from },
  },
}));

vi.mock('sonner', () => ({ toast: toastMocks }));

vi.mock('@/lib/stickerImage', () => ({
  precisaConverterParaWebp: imageMocks.precisaConverterParaWebp,
  converterFigurinhaParaWebp: imageMocks.converterFigurinhaParaWebp,
}));

import { StickerManager } from '@/components/inbox/stickers/StickerManager';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(TooltipProvider, null, children));
}

function renderManager(onSend = vi.fn()) {
  render(createElement(StickerManager, { mode: 'manager', onSend }), { wrapper: createWrapper() });
  return onSend;
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Selecionar arquivo de figurinha') as HTMLInputElement;
}

function webpFile(name = 'gato.webp') {
  return new File(['figurinha'], name, { type: 'image/webp' });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserts = [];
  updates = [];
  insertError = null;
  updateError = null;
  updateRows = [{ id: 's1' }];
  readError = null;
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  storageMocks.from.mockReturnValue({
    upload: storageMocks.upload,
    remove: storageMocks.remove,
    getPublicUrl: storageMocks.getPublicUrl,
  });
  storageMocks.upload.mockResolvedValue({ error: null });
  storageMocks.remove.mockResolvedValue({ error: null });
  storageMocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://exemplo/stickers/enviada.webp' } });
  imageMocks.precisaConverterParaWebp.mockReturnValue(false);
  imageMocks.converterFigurinhaParaWebp.mockResolvedValue(webpFile('convertida.webp'));
  PROFILE_ROWS = [{ id: 'p-admin', user_id: UID, name: 'Ana Admin' }];
  STICKER_ROWS = [
    {
      id: 's1',
      name: 'comemorando',
      image_url: 'https://exemplo/stickers/comemorando.webp',
      category: 'riso',
      is_favorite: false,
      use_count: 3,
      owner_id: null,
      created_at: '2026-10-01T10:00:00Z',
    },
  ];
});

describe('StickerManager — envio de figurinha nova (R2-INB-063)', () => {
  it('Caso 1: o "+" envia a imagem, mostra a revisão e só no Salvar grava a linha', async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    // O botão "+" existe de verdade e tem nome acessível.
    expect(screen.getByRole('button', { name: 'Adicionar nova figurinha' })).toBeInTheDocument();

    fireEvent.change(fileInput(), { target: { files: [webpFile()] } });

    await waitFor(() => expect(storageMocks.upload).toHaveBeenCalledTimes(1));
    expect(storageMocks.from).toHaveBeenCalledWith('stickers');
    expect(storageMocks.upload.mock.calls[0][0]).toMatch(/^sticker_\d+_[0-9a-f-]{36}\.webp$/);
    expect(storageMocks.upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/webp' });

    // Revisão com nome/categoria antes de qualquer escrita.
    await screen.findByRole('dialog', { name: 'Pré-visualização do upload' });
    expect(inserts).toHaveLength(0);
    expect(toastMocks.success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({
      name: 'gato',
      image_url: 'https://exemplo/stickers/enviada.webp',
      category: 'outros',
      is_favorite: false,
      use_count: 0,
      uploaded_by: UID,
    });
    expect(toastMocks.success).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pré-visualização do upload' })).toBeNull());
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it('Caso 2: PNG passa pelo conversor WebP antes de subir', async () => {
    imageMocks.precisaConverterParaWebp.mockReturnValue(true);
    renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    const png = new File(['png'], 'gato.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [png] } });

    await waitFor(() => expect(storageMocks.upload).toHaveBeenCalledTimes(1));
    expect(imageMocks.precisaConverterParaWebp).toHaveBeenCalledWith(png);
    expect(imageMocks.converterFigurinhaParaWebp).toHaveBeenCalledWith(png);
    expect(storageMocks.upload.mock.calls[0][1]).toMatchObject({ type: 'image/webp' });
    expect(storageMocks.upload.mock.calls[0][0]).toMatch(/\.webp$/);
  });

  it('Caso 3: falha ao gravar não vira sucesso e a revisão continua na tela', async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    fireEvent.change(fileInput(), { target: { files: [webpFile()] } });
    await screen.findByRole('dialog', { name: 'Pré-visualização do upload' });

    insertError = { message: 'new row violates row-level security policy' };
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Pré-visualização do upload' })).toBeInTheDocument();
    // O objeto não é apagado: o usuário pode tentar salvar de novo.
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it('Caso 4: cancelar desfaz o envio e não grava linha', async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    fireEvent.change(fileInput(), { target: { files: [webpFile()] } });
    await waitFor(() => expect(storageMocks.upload).toHaveBeenCalledTimes(1));
    const path = storageMocks.upload.mock.calls[0][0] as string;
    await screen.findByRole('dialog', { name: 'Pré-visualização do upload' });

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));

    await waitFor(() => expect(storageMocks.remove).toHaveBeenCalledWith([path]));
    expect(inserts).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pré-visualização do upload' })).toBeNull());
  });

  it('Caso 5: o contador de uso é aguardado e consumido ao enviar', async () => {
    const onSend = renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    fireEvent.click(screen.getByRole('gridcell'));

    expect(onSend).toHaveBeenCalledWith('https://exemplo/stickers/comemorando.webp');
    await waitFor(() => expect(mocks.consumedUpdate).toHaveBeenCalledTimes(1));
    expect(updates[0]).toMatchObject({ use_count: 4 });
  });

  it('Caso 6: consulta com erro mostra o aviso e "Tentar de novo" refaz a leitura', async () => {
    readError = { message: 'timeout' };
    renderManager();

    await screen.findByRole('alert');
    expect(screen.getByText('Não foi possível carregar as figurinhas')).toBeInTheDocument();

    readError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Caso 7: os botões de tamanho da grade têm rótulo acessível', async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(1));

    expect(screen.getByLabelText('Grade pequena')).toBeInTheDocument();
    expect(screen.getByLabelText('Grade média')).toBeInTheDocument();
  });
});
