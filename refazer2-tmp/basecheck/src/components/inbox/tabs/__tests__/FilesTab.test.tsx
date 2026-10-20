import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { SenderProfileMap } from '@/lib/fileSenderIdentity';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';

const mockUseContactMedia = vi.fn();
const mockUseContactMediaCounts = vi.fn();
const mockUseMediaSenderProfiles = vi.fn();
const mockUseDownloadPermission = vi.fn();
const mockUseAuth = vi.fn();

/** R07/S52: captura o payload REAL que chega ao transporte do encaminhamento. */
const encaminhar = vi.hoisted(() => ({ forwardMediaMessages: vi.fn() }));

vi.mock('@/hooks/chat/useForwardMedia', () => ({
  createForwardRunState: () => ({
    completedKeys: new Set<string>(),
    copiedPaths: new Map<string, string>(),
    clientMessageIds: new Map<string, string>(),
  }),
  forwardMediaMessages: encaminhar.forwardMediaMessages,
}));

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
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/hooks/chat/useMediaSenderProfiles', () => ({
  useMediaSenderProfiles: (...args: unknown[]) => mockUseMediaSenderProfiles(...args),
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: (...args: unknown[]) => mockUseDownloadPermission(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    // R07/S52: o diálogo de encaminhamento (o mesmo do cartão) lista os contatos de destino.
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

// O filtro/ordenação vivem na memória de sessão por conversa (etapa 06) — sem zerar,
// um caso vaza o filtro para o próximo (todos usam o mesmo contactId).
beforeEach(() => {
  __resetFilesViewSession();
  localStorage.clear();
  encaminhar.forwardMediaMessages.mockResolvedValue({
    pairOutcomes: [], nonForwardable: [], attempted: 0, sent: 0, failed: 0,
  });
});

const ITEMS: ContactMediaItem[] = [
  { id: 'm1', url: 'https://x/a.jpg', type: 'image', filename: 'foto-praia.jpg', displayName: 'foto-praia.jpg', extension: 'jpg', senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact' },
  { id: 'm2', url: 'https://x/b.pdf', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf', extension: 'pdf', senderLabel: 'Atendente', created_at: '2026-01-11T10:00:00.000Z', caption: null, mimetype: 'application/pdf', size: 2048, meta: null, sender: 'agent' },
];

/** R04: o `agent_id` que liga o cartão ao atendente que enviou o arquivo. */
const ITENS_COM_AUTOR: ContactMediaItem[] = [
  ITEMS[0],
  { ...ITEMS[1], agentId: 'p-2' },
];

const FOTO = 'https://cdn.test/foto.png';

interface MediaOverrides {
  hasMore?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => Promise<{ hasNextPage: boolean } | undefined>;
  isError?: boolean;
}

interface RenderOverrides extends MediaOverrides {
  /** #144/OTH-002: força a query de contagens a falhar (erro != zero confirmado). */
  countsError?: boolean;
  /** R04: perfis devolvidos em lote pelo `useMediaSenderProfiles`. */
  senderProfiles?: SenderProfileMap;
  /** R04: `profiles.id` do usuário logado (decide "Você" no cartão). */
  profileId?: string | null;
  /** R04/D06: resultado do `useDownloadPermission`. */
  canDownload?: boolean;
}

function renderTab(items: ContactMediaItem[] = ITEMS, overrides: RenderOverrides = {}) {
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
    ...overrides,
  });
  mockUseContactMediaCounts.mockReturnValue({
    counts: overrides.countsError ? { all: 0, image: 0, video: 0, audio: 0, document: 0 } : counts,
    isLoading: false,
    isError: overrides.countsError ?? false,
    refetch: vi.fn(),
  });
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1' },
    profile: overrides.profileId ? { id: overrides.profileId } : undefined,
  });
  mockUseMediaSenderProfiles.mockReturnValue({ profiles: overrides.senderProfiles ?? {}, isLoading: false });
  mockUseDownloadPermission.mockReturnValue({ canDownload: overrides.canDownload ?? false, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>
  );
}

describe('FilesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('etapa 16: a grade vem do mapa literal de colunas, sem breakpoint de viewport', () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 959, height: 400, top: 0, left: 0, right: 959, bottom: 400, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    renderTab();
    const grade = screen.getByTestId('files-item-m1').parentElement as HTMLElement;

    expect(grade.className).toContain('grid-cols-4');
    expect(grade.className).toMatch(/grid-cols-[1-8]/);
    expect(grade.className).toContain('gap-3');
    expect(grade.className).not.toMatch(/2xl:|sm:grid-cols|xl:grid-cols|md:grid-cols/);
    rect.mockRestore();
  });

  it('renderiza os chips com as contagens reais por tipo', () => {
    renderTab();
    expect(screen.getByText('Todos').closest('button')).toHaveTextContent('2');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent('1');
    expect(screen.getByText('Docs').closest('button')).toHaveTextContent('1');
    expect(screen.getByText('Vídeos').closest('button')).toHaveTextContent('0');
  });

  // #144/OTH-002: erro na query de contagens não pode virar "0" confirmado nos chips/header.
  it('#144/OTH-002: erro na contagem mostra indisponível, nao um zero confirmado', () => {
    renderTab(ITEMS, { countsError: true });

    const todos = screen.getByText('Todos').closest('button') as HTMLElement;
    const videos = screen.getByText('Vídeos').closest('button') as HTMLElement;
    expect(todos).toHaveTextContent('—');
    expect(videos).toHaveTextContent('—');
    expect(todos).not.toHaveTextContent('0');
    expect(screen.queryByText(/^0 arquivos?$/)).not.toBeInTheDocument();
  });

  it('mostra os dois arquivos por padrão', () => {
    renderTab();
    expect(screen.getByText('foto-praia.jpg')).toBeInTheDocument();
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });

  it('filtra pelo chip de tipo', () => {
    renderTab();
    fireEvent.click(screen.getByText('Imagens'));
    expect(screen.getByText('foto-praia.jpg')).toBeInTheDocument();
    expect(screen.queryByText('contrato.pdf')).not.toBeInTheDocument();
  });

  it('filtra pela busca de nome de arquivo', () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'contrato' } });
    expect(screen.queryByText('foto-praia.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });

  it('estado 2 (etapa 44): vazio real quando não há arquivos', () => {
    renderTab([]);
    expect(screen.getByText('Nenhum arquivo nesta conversa')).toBeInTheDocument();
  });

  it('estado 3 (etapa 44): busca sem resultado cita o termo e limpa', () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nada corresponde a "inexistente"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Limpar busca/ }));
    expect(screen.getByText('foto-praia.jpg')).toBeInTheDocument();
  });

  it('abre o painel de detalhe ao selecionar um card', () => {
    renderTab();
    fireEvent.click(screen.getByText('foto-praia.jpg'));
    expect(screen.getByTestId('file-detail-panel')).toBeInTheDocument();
  });

  // R07/S52: o painel recebe o MESMO handler de encaminhamento do cartão — o caminho
  // completo (diálogo + transporte) é o desta aba, não um atalho novo do painel.
  it('R07/S52: o Encaminhar do painel de detalhes usa o mesmo caminho do cartão', async () => {
    renderTab();
    fireEvent.click(screen.getByText('foto-praia.jpg'));

    const painel = screen.getByTestId('file-detail-panel');
    fireEvent.click(within(painel).getByRole('button', { name: 'Encaminhar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Encaminhar Mensagem' });
    fireEvent.click(await within(dialog).findByText('Bob Destino'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encaminhar' }));

    await waitFor(() => expect(encaminhar.forwardMediaMessages).toHaveBeenCalledTimes(1));
    const payload = encaminhar.forwardMediaMessages.mock.calls[0][0] as Array<{ id: string }>;
    expect(payload.map((midia) => midia.id)).toEqual(['m1']);
  });

  it('etapa 43: com páginas pendentes avisa o recorte carregado e "Carregar tudo" pagina até o fim', async () => {
    const fetchNextPage = vi.fn()
      .mockResolvedValueOnce({ hasNextPage: true })
      .mockResolvedValueOnce({ hasNextPage: false });
    renderTab(ITEMS, { hasMore: true, fetchNextPage });

    expect(screen.getByTestId('files-pagination-notice')).toHaveTextContent('Buscando entre os 2 carregados');

    fireEvent.click(screen.getByRole('button', { name: /Carregar tudo/ }));
    await vi.waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(2));
  });

  it('etapa 41: sem páginas pendentes não há aviso nem rodapé de paginação', () => {
    renderTab();
    expect(screen.queryByTestId('files-pagination-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-load-more')).not.toBeInTheDocument();
  });
});

/**
 * R04 — "foto de quem enviou" no cartão: o lote de perfis (D04) e a permissão de download
 * (D06) nascem UMA vez na aba e chegam ao cartão por props, sem consulta por cartão.
 */
describe('FilesTab — remetente e download do cartão (R04, D01/D04/D06)', () => {
  beforeEach(() => vi.clearAllMocks());

  const PERFIL: SenderProfileMap = { 'p-2': { id: 'p-2', name: 'Ana Atendente', avatar_url: FOTO } };

  it('D04: o lote é pedido pela TELA (todos os agent_id de uma vez), não por cartão', () => {
    renderTab(ITENS_COM_AUTOR, { senderProfiles: PERFIL });

    // Se fosse por cartão, cada chamada traria um id só — aqui vem a lista da tela inteira.
    const idsDoLote = mockUseMediaSenderProfiles.mock.calls[0][0] as unknown[];
    expect(idsDoLote).toContain('p-2');
    expect(idsDoLote).toHaveLength(ITENS_COM_AUTOR.length);

    // A identidade do lote chega ao cartão real (foto + nome de quem enviou).
    const cartao = within(screen.getByTestId('files-item-m2'));
    expect(cartao.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Atendente');
    expect(cartao.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('D01: o perfil do usuário logado chega ao cartão e vira "Você"', () => {
    renderTab(ITENS_COM_AUTOR, { senderProfiles: PERFIL, profileId: 'p-2' });

    expect(within(screen.getByTestId('files-item-m2')).getByTestId('sender-avatar-name'))
      .toHaveTextContent('Você');
  });

  it('D06: sem permissão o cartão mostra o cadeado; com permissão, o botão Baixar', () => {
    const { unmount } = renderTab(ITENS_COM_AUTOR, { canDownload: false });
    const cartao = () => within(screen.getByTestId('files-item-m2'));
    expect(cartao().getByRole('button', { name: /bloqueado por política de segurança/i })).toBeInTheDocument();
    expect(cartao().queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    unmount();

    renderTab(ITENS_COM_AUTOR, { canDownload: true });
    expect(cartao().getByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });
});
