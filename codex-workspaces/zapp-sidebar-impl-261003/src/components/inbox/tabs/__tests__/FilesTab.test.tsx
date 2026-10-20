import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';

const mockUseContactMedia = vi.fn();

vi.mock('@/hooks/chat/useContactMedia', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMedia')>('@/hooks/chat/useContactMedia');
  return { ...actual, useContactMedia: (...args: unknown[]) => mockUseContactMedia(...args) };
});

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: vi.fn(),
    storage: { from: () => ({ createSignedUrls: vi.fn() }) },
  },
}));

// O filtro/ordenação vivem na memória de sessão por conversa (etapa 06) — sem zerar,
// um caso vaza o filtro para o próximo (todos usam o mesmo contactId).
beforeEach(() => {
  __resetFilesViewSession();
  localStorage.clear();
});

const ITEMS: ContactMediaItem[] = [
  { id: 'm1', url: 'https://x/a.jpg', type: 'image', filename: 'foto-praia.jpg', displayName: 'foto-praia.jpg', extension: 'jpg', senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact' },
  { id: 'm2', url: 'https://x/b.pdf', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf', extension: 'pdf', senderLabel: 'Atendente', created_at: '2026-01-11T10:00:00.000Z', caption: null, mimetype: 'application/pdf', size: 2048, meta: null, sender: 'agent' },
];

function renderTab(items: ContactMediaItem[] = ITEMS) {
  const counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    video: items.filter((i) => i.type === 'video').length,
    audio: items.filter((i) => i.type === 'audio').length,
    document: items.filter((i) => i.type === 'document').length,
  };
  mockUseContactMedia.mockReturnValue({ data: { items, counts }, isLoading: false });
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
    // O jsdom não tem layout (o contêiner mede 0 → grid-cols-1), então forço a largura de
    // 959 px da tabela do plano: a capacidade dá 5, mas a preferência padrão é 4 e a
    // regra da etapa 07 é "preferência menor que a capacidade manda" → 4 colunas.
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

  it('mostra o empty state honesto quando não há arquivos', () => {
    renderTab([]);
    expect(screen.getByText('Nenhum arquivo encontrado')).toBeInTheDocument();
  });

  it('abre o painel de detalhe ao selecionar um card', () => {
    renderTab();
    fireEvent.click(screen.getByText('foto-praia.jpg'));
    expect(screen.getByTestId('file-detail-panel')).toBeInTheDocument();
  });
});
