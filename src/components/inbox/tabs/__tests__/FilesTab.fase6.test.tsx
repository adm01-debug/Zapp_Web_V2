import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';
import { toast } from 'sonner';

const h = vi.hoisted(() => ({
  updateError: { value: null as unknown },
  update: vi.fn(),
  eq: vi.fn(),
}));

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
    from: () => ({ update: h.update }),
    storage: { from: () => ({ createSignedUrls: vi.fn() }) },
  },
}));

const IMAGE: ContactMediaItem = {
  id: 'm1', url: 'https://x/foto.jpg', type: 'image', filename: 'foto-praia.jpg', displayName: 'foto-praia.jpg',
  extension: 'jpg', senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null,
  mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact',
};
const DOC: ContactMediaItem = {
  id: 'm2', url: 'https://x/contrato.pdf', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', senderLabel: 'Atendente', created_at: '2026-01-11T10:00:00.000Z', caption: null,
  mimetype: 'application/pdf', size: 2048, meta: null, sender: 'agent',
};

function videoItem(i: number): ContactMediaItem {
  return {
    id: `item-${i}`, url: `https://x/v${i}.mp4`, type: 'video', filename: `cli${i}.mp4`, displayName: `cli${i}.mp4`,
    extension: 'mp4', senderLabel: null, created_at: `2026-02-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
    caption: null, mimetype: 'video/mp4', size: 4096, meta: null, sender: 'contact',
  };
}
function imageItem(i: number): ContactMediaItem {
  return {
    id: `item-${i}`, url: `https://x/f${i}.jpg`, type: 'image', filename: `cli${i}.jpg`, displayName: `cli${i}.jpg`,
    extension: 'jpg', senderLabel: null, created_at: `2026-03-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
    caption: null, mimetype: 'image/jpeg', size: 1024, meta: null, sender: 'contact',
  };
}

/** 56 itens: itens 0 e 1 são vídeo (filtro Vídeos = 2); o resto imagem. */
function build56(): ContactMediaItem[] {
  return [videoItem(0), videoItem(1), ...Array.from({ length: 54 }, (_, i) => imageItem(i + 2))];
}

function renderTab(items: ContactMediaItem[]) {
  const counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    video: items.filter((i) => i.type === 'video').length,
    audio: 0,
    document: items.filter((i) => i.type === 'document').length,
  };
  mockUseContactMedia.mockReturnValue({ data: { items, counts }, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>,
  );
}

function mockWidth(width: number) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height: 400, top: 0, left: 0, right: width, bottom: 400, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function seedPrefs(columns: number) {
  localStorage.setItem('zapp.inbox.files.view:user-1', JSON.stringify({ v: 1, viewMode: 'grid', columns }));
}

function gridClass(): string {
  return (screen.getByTestId('files-item-m1').parentElement as HTMLElement).className;
}

function enterSelection() {
  fireEvent.click(screen.getByTestId('files-select-toggle'));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetFilesViewSession();
  localStorage.clear();
  h.updateError.value = null;
  h.update.mockImplementation(() => ({ eq: h.eq }));
  h.eq.mockImplementation(() => Promise.resolve({ error: h.updateError.value }));
});

describe('FilesTab fase 6 — detalhes (etapa 31)', () => {
  it('com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid (Sheet sobreposto)', () => {
    seedPrefs(8);
    const rect = mockWidth(959);
    renderTab([IMAGE, DOC]);

    // antes: capacidade 5 (min(pref 8, capacidade 5)) — o grid mede o contêiner real
    expect(gridClass()).toContain('grid-cols-5');

    fireEvent.click(screen.getByText('contrato.pdf'));

    expect(gridClass()).toContain('grid-cols-5'); // não caiu: o Sheet não tira espaço do grid
    expect(screen.getByTestId('file-detail-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('file-detail-panel-inline')).not.toBeInTheDocument();
    rect.mockRestore();
  });

  it('com 1474 px abre lado a lado (260 px) e o grid cai de 8 para 6', () => {
    seedPrefs(8);
    const rect = mockWidth(1474);
    renderTab([IMAGE, DOC]);

    expect(gridClass()).toContain('grid-cols-8');

    fireEvent.click(screen.getByText('contrato.pdf'));

    expect(gridClass()).toContain('grid-cols-6');
    expect(screen.getByTestId('file-detail-panel-inline')).toBeInTheDocument();
    expect(screen.queryByTestId('file-detail-sheet')).not.toBeInTheDocument();
    // o mesmo conteúdo nos dois modos
    expect(screen.getByTestId('file-detail-panel')).toBeInTheDocument();
    expect(screen.getByText(/Data: 11\/01\/2026/)).toBeInTheDocument();
    rect.mockRestore();
  });
});

describe('FilesTab fase 6 — barra de seleção e alcance (etapas 32-33)', () => {
  it('etapa 32: a barra bate com selectedIds.size e some ao cancelar', () => {
    renderTab([IMAGE, DOC]);
    expect(screen.queryByTestId('files-selection-bar')).not.toBeInTheDocument();

    enterSelection();
    expect(screen.getByTestId('files-selection-bar')).toBeInTheDocument();
    expect(screen.getByText('0 selecionados')).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(within(screen.getByTestId('files-item-m1')).getByRole('checkbox', { name: 'Selecionar foto-praia.jpg' }));
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('files-selection-bar')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('files-selection-bar')).not.toBeInTheDocument();
  });

  it('etapa 33: 56 itens, filtro Vídeos, selecionar todos → 2; voltar a Todos → 2; de novo → 56', () => {
    renderTab(build56());
    enterSelection();
    expect(screen.getByText('Selecionar todos (56 visíveis)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Vídeos'));
    expect(screen.getByText('Selecionar todos (2 visíveis)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Todos'));
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByText('56 selecionados')).toBeInTheDocument();

    // trocar o filtro de volta: a barra explica quantos ficaram fora
    fireEvent.click(screen.getByText('Vídeos'));
    expect(screen.getByText('54 selecionados fora do filtro')).toBeInTheDocument();
  });
});

describe('FilesTab fase 6 — ciclo de vida da seleção (etapa 34)', () => {
  it('nunca persiste ids de seleção em localStorage', () => {
    renderTab(build56());
    enterSelection();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByText('56 selecionados')).toBeInTheDocument();

    const dump = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '').join('|');
    expect(dump).not.toContain('item-');
  });

  it('a seleção sobrevive quando a busca muda o recorte', () => {
    renderTab([IMAGE, DOC]);
    enterSelection();
    fireEvent.click(within(screen.getByTestId('files-item-m1')).getByRole('checkbox', { name: 'Selecionar foto-praia.jpg' }));
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'contrato' } });
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();
    expect(screen.getByText('1 selecionados fora do filtro')).toBeInTheDocument();
  });
});

describe('FilesTab fase 6 — exclusão com AlertDialog (etapa 35)', () => {
  async function openDeleteDialogForM2() {
    enterSelection();
    fireEvent.click(within(screen.getByTestId('files-item-m2')).getByRole('checkbox', { name: 'Selecionar contrato.pdf' }));
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();

    fireEvent.pointerDown(within(screen.getByTestId('files-item-m2')).getByRole('button', { name: 'Mais ações' }), { button: 0 });
    fireEvent.click(screen.getByRole('menuitem', { name: /Excluir mensagem/ }));
    await screen.findByRole('alertdialog');
  }

  it('o diálogo descreve o efeito real, não um window.confirm', async () => {
    renderTab([IMAGE, DOC]);
    await openDeleteDialogForM2();

    expect(screen.getByText('Apagar mensagem?')).toBeInTheDocument();
    expect(screen.getByText(/is_deleted = true/)).toBeInTheDocument();
    expect(screen.getByText(/\[Mensagem apagada\]/)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp do cliente/)).toBeInTheDocument();
  });

  it('update rejeitado → toast de erro e o item continua na lista e na seleção', async () => {
    h.updateError.value = { message: 'rls' };
    renderTab([IMAGE, DOC]);
    await openDeleteDialogForM2();

    fireEvent.click(screen.getByRole('button', { name: 'Apagar mensagem' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao apagar mensagem'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('files-item-m2')).toBeInTheDocument();
    expect(screen.getByText('1 selecionado')).toBeInTheDocument(); // a seleção NÃO zerou
  });

  it('update aceito → update fiel, sucesso e o item sai da seleção (refetch via invalidação)', async () => {
    renderTab([IMAGE, DOC]);
    await openDeleteDialogForM2();

    fireEvent.click(screen.getByRole('button', { name: 'Apagar mensagem' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({ is_deleted: true, content: '[Mensagem apagada]' });
    expect(h.eq).toHaveBeenCalledWith('id', 'm2');
    // sem refetch devolver (etapa 09), o item só sai quando a query invalida; aqui o efeito
    // observável é a seleção zerar — a invalidação das chaves é coberta no teste do hook.
    expect(await screen.findByText('0 selecionados')).toBeInTheDocument();
  });
});
