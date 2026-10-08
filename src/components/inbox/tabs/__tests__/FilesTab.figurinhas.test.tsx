import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';

/**
 * M05 — chip "Figurinhas" na aba Arquivos: contagem própria, separação de "Imagens" e miniatura.
 *
 * A figurinha chega com `type: 'sticker'` (classificação provada em
 * `useContactMedia.sticker.test.tsx`). Aqui a prova é na TELA real: o chip, o filtro, a
 * miniatura do cartão e o payload do encaminhamento (a figurinha sai pelo transporte de
 * imagem, como antes de existir o tipo próprio).
 */

const h = vi.hoisted(() => ({ forwardMediaMessages: vi.fn() }));

const mockUseContactMedia = vi.fn();
const mockUseContactMediaCounts = vi.fn();

vi.mock('@/hooks/chat/useContactMedia', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMedia')>('@/hooks/chat/useContactMedia');
  return { ...actual, useContactMedia: (...args: unknown[]) => mockUseContactMedia(...args) };
});

vi.mock('@/hooks/chat/useContactMediaCounts', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMediaCounts')>('@/hooks/chat/useContactMediaCounts');
  return { ...actual, useContactMediaCounts: (...args: unknown[]) => mockUseContactMediaCounts(...args) };
});

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Captura o payload real do encaminhamento (módulo é a fronteira de rede, não o sujeito).
vi.mock('@/hooks/chat/useForwardMedia', () => ({
  createForwardRunState: () => ({
    completedKeys: new Set<string>(),
    copiedPaths: new Map<string, string>(),
    clientMessageIds: new Map<string, string>(),
  }),
  forwardMediaMessages: h.forwardMediaMessages,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: (table: string) => {
      if (table === 'contacts') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [{ id: 'dest-1', name: 'Bob Destino', phone: '5511999999999', avatar_url: null }],
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
    },
    storage: { from: () => ({ createSignedUrls: vi.fn() }) },
  },
}));

// O filtro vive na memória de sessão por conversa (etapa 06): sem zerar, um caso vaza para o próximo.
beforeEach(() => {
  __resetFilesViewSession();
  localStorage.clear();
  h.forwardMediaMessages.mockResolvedValue({
    pairOutcomes: [], nonForwardable: [], attempted: 0, sent: 0, failed: 0,
  });
});

const IMAGEM_A: ContactMediaItem = {
  id: 'img-1', url: 'https://x/foto-praia.jpg', type: 'image', filename: 'foto-praia.jpg',
  displayName: 'foto-praia.jpg', extension: 'jpg', senderLabel: null,
  created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'image/jpeg', size: 1024,
  meta: null, sender: 'contact',
};
const IMAGEM_B: ContactMediaItem = {
  ...IMAGEM_A, id: 'img-2', url: 'https://x/foto-campo.jpg', filename: 'foto-campo.jpg',
  displayName: 'foto-campo.jpg',
};
const FIGURINHA: ContactMediaItem = {
  id: 'fig-1', url: 'https://x/figurinha.webp', type: 'sticker', filename: 'figurinha.webp',
  displayName: 'figurinha.webp', extension: 'webp', senderLabel: null,
  created_at: '2026-01-12T10:00:00.000Z', caption: null, mimetype: null, size: 2048,
  meta: null, sender: 'contact',
};

function renderTab(items: ContactMediaItem[]) {
  // As contagens da aba vêm do BANCO (hook próprio), nunca da lista carregada.
  mockUseContactMediaCounts.mockReturnValue({
    counts: {
      all: items.length,
      image: items.filter((item) => item.type === 'image').length,
      video: items.filter((item) => item.type === 'video').length,
      audio: items.filter((item) => item.type === 'audio').length,
      document: items.filter((item) => item.type === 'document').length,
      sticker: items.filter((item) => item.type === 'sticker').length,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseContactMedia.mockReturnValue({
    items,
    hasMore: false,
    isLoading: false,
    isFetchingNextPage: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn().mockResolvedValue({ hasNextPage: false }),
    refetch: vi.fn(),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>,
  );
}

describe('M05 — chip "Figurinhas" na aba Arquivos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tem contagem própria e "Imagens" não conta a figurinha', () => {
    renderTab([IMAGEM_A, IMAGEM_B, FIGURINHA]);

    expect(screen.getByText('Figurinhas').closest('button')).toHaveTextContent('1');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent('2');
    expect(screen.getByText('Todos').closest('button')).toHaveTextContent('3');
  });

  it('filtra só figurinhas e "Imagens" não a inclui ("Todos" inclui tudo)', () => {
    renderTab([IMAGEM_A, IMAGEM_B, FIGURINHA]);

    fireEvent.click(screen.getByText('Figurinhas'));
    expect(screen.getByTestId('files-item-fig-1')).toBeInTheDocument();
    expect(screen.queryByTestId('files-item-img-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-item-img-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Imagens'));
    expect(screen.getByTestId('files-item-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('files-item-img-2')).toBeInTheDocument();
    expect(screen.queryByTestId('files-item-fig-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Todos'));
    expect(screen.getByTestId('files-item-fig-1')).toBeInTheDocument();
    expect(screen.getByTestId('files-item-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('files-item-img-2')).toBeInTheDocument();
  });

  it('a figurinha aparece com miniatura de imagem e rótulo "Figurinha"', () => {
    const { container } = renderTab([FIGURINHA]);

    const miniatura = container.querySelector('[data-testid="files-thumb-fig-1"] img');
    expect(miniatura).not.toBeNull();
    expect(miniatura).toHaveAttribute('src', FIGURINHA.url);
    expect(screen.getByText(/^Figurinha · /)).toBeInTheDocument();
  });

  it('encaminha a figurinha pelo transporte de imagem (não vira tipo desconhecido)', async () => {
    renderTab([IMAGEM_A, FIGURINHA]);

    fireEvent.click(screen.getByTestId('files-select-toggle'));
    fireEvent.click(screen.getByText('Figurinhas'));
    fireEvent.click(
      within(screen.getByTestId('files-item-fig-1')).getByRole('checkbox', { name: 'Selecionar figurinha.webp' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar 1' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByText('Bob Destino'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encaminhar' }));

    await waitFor(() => expect(h.forwardMediaMessages).toHaveBeenCalledTimes(1));
    const payload = h.forwardMediaMessages.mock.calls[0][0] as { id: string; type: string }[];
    expect(payload.map((item) => [item.id, item.type])).toEqual([['fig-1', 'image']]);
  });
});
