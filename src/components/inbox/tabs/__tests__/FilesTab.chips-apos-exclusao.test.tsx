import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';
import { toast } from 'sonner';

/**
 * #144 / OTH-002 visto pela TELA (etapa 42): o chip conta no BANCO, não na lista carregada.
 *
 * O `FilesTab.fase6` prova que a seleção zera na exclusão, mas deixa explícito que NÃO cobre o
 * chip — "a invalidação das chaves é coberta no teste do hook". Aqui o `FilesTab` REAL roda com
 * o `useContactMediaCounts` REAL (só o Supabase é falso), então o número que o operador lê só
 * cai se a exclusão realmente invalidar `contactMediaCountsKey`: sem a invalidação o chip fica
 * com o número antigo (a `staleTime` de 30s não reagenda e não há foco/montagem no teste).
 */
const db = vi.hoisted(() => ({
  deleted: new Set<string>(),
  rows: [
    { id: 'm1', type: 'image' },
    { id: 'm3', type: 'image' },
    { id: 'm2', type: 'document' },
  ] as Array<{ id: string; type: string }>,
}));

const MESSAGE_TYPE_KINDS: Record<string, string> = {
  image: 'image', video: 'video', 'audio,ptt': 'audio', document: 'document', sticker: 'sticker',
};

/** A contagem por tipo do hook: mesma consulta, respondida como o banco responderia. */
function countFor(kinds: string | null): number {
  const alive = db.rows.filter((row) => !db.deleted.has(row.id));
  if (kinds === null) return alive.length;
  const kind = MESSAGE_TYPE_KINDS[kinds];
  return alive.filter((row) => row.type === kind).length;
}

function queryBuilder() {
  let kinds: string | null = null;
  let updateId: string | null = null;
  const query: Record<string, unknown> = {};
  const chain = () => query;
  Object.assign(query, {
    select: chain,
    update: chain,
    not: chain,
    or: chain,
    order: chain,
    limit: chain,
    range: chain,
    single: chain,
    maybeSingle: chain,
    eq: (column: string, value: string) => {
      if (column === 'id') updateId = value;
      return query;
    },
    in: (_column: string, values: string[]) => {
      kinds = values.join(',');
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (updateId) {
        // O UPDATE é a escrita: a linha sai do universo contado, como no banco.
        db.deleted.add(updateId);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      return Promise.resolve({ data: null, count: countFor(kinds), error: null }).then(resolve);
    },
  });
  return query;
}

const mockUseContactMedia = vi.fn();

vi.mock('@/hooks/chat/useContactMedia', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMedia')>('@/hooks/chat/useContactMedia');
  return { ...actual, useContactMedia: (...args: unknown[]) => mockUseContactMedia(...args) };
});

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: () => queryBuilder(),
    storage: { from: () => ({ createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }) }) },
  },
}));

const IMAGES: ContactMediaItem[] = [1, 3].map((n) => ({
  id: `m${n}`, url: `https://x/foto${n}.jpg`, type: 'image', filename: `foto${n}.jpg`, displayName: `foto${n}.jpg`,
  extension: 'jpg', senderLabel: null, created_at: `2026-01-0${n}T10:00:00.000Z`, caption: null,
  mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact',
}));
const DOC: ContactMediaItem = {
  id: 'm2', url: 'https://x/contrato.pdf', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', senderLabel: 'Atendente', created_at: '2026-01-11T10:00:00.000Z', caption: null,
  mimetype: 'application/pdf', size: 2048, meta: null, sender: 'agent',
};

function renderTab() {
  // A lista de mídia espelha a exclusão (mesmo efeito do banco) — o cartão apagado sai da grade.
  mockUseContactMedia.mockImplementation(() => ({
    items: [...IMAGES, DOC].filter((item) => !db.deleted.has(item.id)),
    hasMore: false,
    isLoading: false,
    isFetchingNextPage: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn().mockResolvedValue({ hasNextPage: false }),
    refetch: vi.fn(),
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>,
  );
}

/** O número que o operador lê dentro do chip, sem o rótulo. */
function chipCount(label: string): string {
  const chip = screen.getByText(label).closest('button');
  return (chip?.textContent ?? '').replace(label, '').trim();
}

async function deleteDocFromMenu() {
  fireEvent.click(screen.getByTestId('files-select-toggle'));
  fireEvent.click(within(screen.getByTestId('files-item-m2')).getByRole('checkbox', { name: 'Selecionar contrato.pdf' }));
  expect(screen.getByText('1 selecionado')).toBeInTheDocument();

  fireEvent.pointerDown(within(screen.getByTestId('files-item-m2')).getByRole('button', { name: 'Mais ações' }), { button: 0 });
  fireEvent.click(screen.getByRole('menuitem', { name: /Excluir mensagem/ }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Apagar mensagem' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetFilesViewSession();
  localStorage.clear();
  db.deleted.clear();
});

describe('FilesTab — chips por tipo após excluir mídia (#144 / OTH-002)', () => {
  it('a contagem do banco é lida na montagem: 3 arquivos, 2 imagens e 1 doc', async () => {
    renderTab();
    expect(await screen.findByText('3 arquivos')).toBeInTheDocument();
    expect(chipCount('Todos')).toBe('3');
    expect(chipCount('Imagens')).toBe('2');
    expect(chipCount('Docs')).toBe('1');
  });

  it('excluir o documento recalcula os chips e o total pela contagem do banco', async () => {
    renderTab();
    expect(await screen.findByText('3 arquivos')).toBeInTheDocument();
    expect(chipCount('Docs')).toBe('1');

    await deleteDocFromMenu();

    await waitFor(() => expect(screen.getByText('2 arquivos')).toBeInTheDocument());
    expect(chipCount('Todos')).toBe('2');
    expect(chipCount('Docs')).toBe('0');
    expect(chipCount('Imagens')).toBe('2'); // o tipo apagado não derruba a contagem dos outros
    expect(toast.error).not.toHaveBeenCalled();
    // o cartão apagado sai da grade junto com o número — a tela não mente para o operador
    expect(screen.queryByTestId('files-item-m2')).not.toBeInTheDocument();
  });
});
