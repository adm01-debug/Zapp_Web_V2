import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

const mockUseContactMedia = vi.fn();

vi.mock('@/hooks/chat/useContactMedia', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/chat/useContactMedia')>('@/hooks/chat/useContactMedia');
  return { ...actual, useContactMedia: (...args: unknown[]) => mockUseContactMedia(...args) };
});

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const ITEMS: ContactMediaItem[] = [
  { id: 'm1', url: 'https://x/a.jpg', type: 'image', filename: 'foto-praia.jpg', created_at: '2026-01-10T10:00:00.000Z', caption: null, mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact' },
  { id: 'm2', url: 'https://x/b.pdf', type: 'document', filename: 'contrato.pdf', created_at: '2026-01-11T10:00:00.000Z', caption: null, mimetype: 'application/pdf', size: 2048, meta: null, sender: 'agent' },
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
