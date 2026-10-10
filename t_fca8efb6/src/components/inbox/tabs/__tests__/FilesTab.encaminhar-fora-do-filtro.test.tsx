import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';

/**
 * Regressão do item 51 / OTH-001: "Encaminhar N omite arquivos selecionados fora do filtro".
 *
 * Contrato: a seleção usada no envio vem do estado canônico de itens selecionados
 * (`selection.selectedIds` sobre a coleção completa `items`), NÃO da lista filtrada/visível
 * (`filtered`). Trocar o filtro depois de selecionar não pode remover do encaminhamento os
 * arquivos que continuam selecionados.
 *
 * A prova é feita no payload REAL da ação de encaminhar: `forwardMediaMessages` (etapa 38) é
 * o destino do `onForward` do diálogo; aqui ele é mockado para capturar a lista de arquivos.
 * O diálogo recebe exatamente a mesma lista, então ambas as asserções cobrem o mesmo payload.
 */

const h = vi.hoisted(() => ({
  forwardMediaMessages: vi.fn(),
}));

const mockUseContactMedia = vi.fn();
const mockUseContactMediaCounts = vi.fn();

vi.mock('@/hooks/chat/useContactMedia', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMedia')>('@/hooks/chat/useContactMedia');
  return { ...actual, useContactMedia: (...args: unknown[]) => mockUseContactMedia(...args) };
});

vi.mock('@/hooks/chat/useContactMediaCounts', () => ({
  useContactMediaCounts: (...args: unknown[]) => mockUseContactMediaCounts(...args),
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

// Mock da ação de encaminhar (etapa 38): captura o array de arquivos que chega ao envio.
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

const IMG_A: ContactMediaItem = {
  id: 'm1', url: 'https://x/foto-a.jpg', type: 'image', filename: 'foto-a.jpg', displayName: 'foto-a.jpg',
  extension: 'jpg', senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null,
  mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact',
};
const IMG_B: ContactMediaItem = {
  id: 'm2', url: 'https://x/foto-b.jpg', type: 'image', filename: 'foto-b.jpg', displayName: 'foto-b.jpg',
  extension: 'jpg', senderLabel: null, created_at: '2026-01-11T10:00:00.000Z', caption: null,
  mimetype: 'image/jpeg', size: 2048, meta: null, sender: 'contact',
};
const DOC: ContactMediaItem = {
  id: 'm3', url: 'https://x/contrato.pdf', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', senderLabel: 'Atendente', created_at: '2026-01-12T10:00:00.000Z', caption: null,
  mimetype: 'application/pdf', size: 4096, meta: null, sender: 'agent',
};

function renderTab(items: ContactMediaItem[]) {
  const counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    video: items.filter((i) => i.type === 'video').length,
    audio: items.filter((i) => i.type === 'audio').length,
    document: items.filter((i) => i.type === 'document').length,
  };
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
  mockUseContactMediaCounts.mockReturnValue({ counts, isLoading: false, isError: false, refetch: vi.fn() });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>,
  );
}

/** Seleciona um item pelo checkbox do card (o nome vem do `displayName`). */
function selectItem(id: string, name: string) {
  fireEvent.click(within(screen.getByTestId(`files-item-${id}`)).getByRole('checkbox', { name: `Selecionar ${name}` }));
}

/** Seleciona os 3 arquivos passando por filtros distintos: Imagens (m1, m2) e Docs (m3). */
function selectAcrossFilters() {
  fireEvent.click(screen.getByTestId('files-select-toggle'));
  fireEvent.click(screen.getByText('Imagens'));
  selectItem('m1', 'foto-a.jpg');
  selectItem('m2', 'foto-b.jpg');
  fireEvent.click(screen.getByText('Docs'));
  selectItem('m3', 'contrato.pdf');
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetFilesViewSession();
  localStorage.clear();
  h.forwardMediaMessages.mockResolvedValue({
    pairOutcomes: [], nonForwardable: [], attempted: 0, sent: 0, failed: 0,
  });
});

describe('FilesTab — encaminhar N com arquivos fora do filtro (#51 / OTH-001)', () => {
  it('leva TODOS os N selecionados ao payload quando o filtro esconde parte da seleção', async () => {
    renderTab([IMG_A, IMG_B, DOC]);
    selectAcrossFilters();

    // Filtro em "Docs": 3 selecionados, mas só 1 está visível no recorte.
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
    expect(screen.getByText('2 selecionados fora do filtro')).toBeInTheDocument();

    // Abre o encaminhamento e dispara de verdade para um destino.
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar 3' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByText('Bob Destino'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encaminhar' }));

    await waitFor(() => expect(h.forwardMediaMessages).toHaveBeenCalledTimes(1));
    const payloadIds = h.forwardMediaMessages.mock.calls[0][0].map((item: { id: string }) => item.id);
    // Inclusão (o ponto do defeito), não a ordem: os 3 selecionados chegam ao envio.
    expect([...payloadIds].sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('o diálogo de encaminhamento mostra os N arquivos selecionados, não só os do recorte', async () => {
    renderTab([IMG_A, IMG_B, DOC]);
    selectAcrossFilters();

    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar 3' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('3 arquivos selecionados')).toBeInTheDocument();
    expect(within(dialog).getByText(/foto-a\.jpg/)).toBeInTheDocument();
    expect(within(dialog).getByText(/foto-b\.jpg/)).toBeInTheDocument();
    expect(within(dialog).getByText(/contrato\.pdf/)).toBeInTheDocument();
  });
});
