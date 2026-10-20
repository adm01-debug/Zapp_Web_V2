import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { SenderProfileMap } from '@/lib/fileSenderIdentity';
import { __resetFilesViewSession } from '@/hooks/chat/useFilesViewState';

/**
 * R08 (S55/S56) — cabeçalho do cartão de arquivo e funil com PERÍODO + REMETENTE.
 *
 * Componente REAL: a lista vem do `useContactMedia` mockado (hook de dados de outro cartão) e o
 * resto do caminho é verdadeiro — o funil, o estado de sessão (`useFilesViewState`) e a mesma
 * `resolveSenderIdentity` (D01) que o cartão usa. O lote de perfis é mockado porque a consulta é
 * do `useMediaSenderProfiles` (R01), não desta tela.
 */

const mockUseContactMedia = vi.fn();
const mockUseContactMediaCounts = vi.fn();
const mockUseMediaSenderProfiles = vi.fn();
const mockUseDownloadPermission = vi.fn();
const mockUseAuth = vi.fn();

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
    from: vi.fn(),
    storage: { from: () => ({ createSignedUrls: vi.fn() }) },
  },
}));

// O recorte (tipo/busca/período/remetente) vive na memória de sessão por conversa — sem zerar,
// um caso vaza o funil para o próximo (todos usam o mesmo contactId).
beforeEach(() => {
  __resetFilesViewSession();
  localStorage.clear();
  vi.clearAllMocks();
});

const CONTATO = 'Ana Cliente';
const DIA_MS = 24 * 60 * 60 * 1000;
const diasAtras = (n: number) => new Date(Date.now() - n * DIA_MS).toISOString();

/** Os quatro tipos de remetente da D01: contato, você, outro atendente e Equipe (sem perfil). */
const PERFIS: SenderProfileMap = {
  'p-eu': { id: 'p-eu', name: 'Eu Atendente' },
  'p-2': { id: 'p-2', name: 'Ana Atendente' },
};

function item(overrides: Partial<ContactMediaItem> & { id: string }): ContactMediaItem {
  const filename = overrides.filename ?? `${overrides.id}.jpg`;
  return {
    url: `https://x/${overrides.id}.jpg`,
    type: 'image',
    filename,
    displayName: filename,
    extension: 'jpg',
    senderLabel: null,
    created_at: diasAtras(1),
    caption: null,
    mimetype: 'image/jpeg',
    size: 1024,
    meta: null,
    sender: 'contact',
    ...overrides,
  };
}

function cenario(): ContactMediaItem[] {
  return [
    item({ id: 'do-cliente', filename: 'foto-cliente.jpg', created_at: diasAtras(1) }),
    item({ id: 'meu-doc', filename: 'meu-contrato.pdf', type: 'document', sender: 'agent', agentId: 'p-eu', created_at: diasAtras(2) }),
    item({ id: 'da-ana', filename: 'foto-ana.jpg', sender: 'agent', agentId: 'p-2', created_at: diasAtras(20) }),
    item({ id: 'da-equipe', filename: 'audio-equipe.ogg', type: 'audio', sender: 'agent', agentId: null, created_at: diasAtras(3) }),
  ];
}

function renderTab(items: ContactMediaItem[] = cenario()) {
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
  mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, profile: { id: 'p-eu' } });
  mockUseMediaSenderProfiles.mockReturnValue({ profiles: PERFIS, isLoading: false });
  mockUseDownloadPermission.mockReturnValue({ canDownload: false, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName={CONTATO} />
    </QueryClientProvider>,
  );
}

/** R08: o funil guarda o período e o remetente. Abrir é idempotente (o painel continua aberto
 *  depois de escolher um atalho de data). */
function abrirFunil() {
  if (!screen.queryByTestId('files-filter-panel')) {
    fireEvent.click(screen.getByTestId('files-filter-trigger'));
  }
  return screen.getByTestId('files-filter-panel');
}

function marcarRemetente(key: string, rotulo: string) {
  abrirFunil();
  fireEvent.click(within(screen.getByTestId(`files-sender-${key}`)).getByRole('checkbox', { name: rotulo }));
}

function escolherAtalho(nome: string) {
  abrirFunil();
  const gatilho = within(screen.getByTestId('files-period-filter')).getAllByRole('button')[0];
  fireEvent.click(gatilho);
  fireEvent.click(screen.getByRole('button', { name: nome }));
}

describe('FilesTab — cabeçalho (R08/S55)', () => {
  it('traz o título e o subtítulo do mockup, sem tirar os chips nem a contagem', () => {
    renderTab();

    expect(screen.getByRole('heading', { name: 'Arquivos compartilhados' })).toBeInTheDocument();
    expect(screen.getByTestId('files-subtitle')).toHaveTextContent(
      'Todos os arquivos, mídias e documentos desta conversa.',
    );
    // O que a tela já mostrava continua: chips por tipo e contagem honesta.
    expect(screen.getByText('Todos').closest('button')).toHaveTextContent('4');
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('4 arquivos');
  });
});

describe('FilesTab — funil de remetente (R08/S56)', () => {
  it('lista Você, o contato, cada atendente e Equipe, com a contagem do recorte', () => {
    renderTab();
    const painel = abrirFunil();

    const esperado: [string, string, string][] = [
      ['self', 'Você', '1'],
      ['contact', CONTATO, '1'],
      ['agent:p-2', 'Ana Atendente', '1'],
      ['team', 'Equipe', '1'],
    ];
    for (const [key, rotulo, contagem] of esperado) {
      const linha = within(painel).getByTestId(`files-sender-${key}`);
      expect(within(linha).getByText(rotulo)).toBeInTheDocument();
      expect(linha).toHaveTextContent(contagem);
    }
    // Nenhum marcado = todos: os quatro arquivos seguem na lista.
    expect(screen.getByText('foto-cliente.jpg')).toBeInTheDocument();
    expect(screen.getByText('foto-ana.jpg')).toBeInTheDocument();
  });

  it('marcar "Você" deixa só os arquivos do usuário logado e conta o filtro no funil', () => {
    renderTab();
    marcarRemetente('self', 'Você');

    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByText('foto-cliente.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('foto-ana.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('audio-equipe.ogg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-filter-trigger').textContent).toBe('Filtros1');
  });

  it('nenhum marcado = todos: desmarcar devolve a lista inteira', () => {
    renderTab();
    marcarRemetente('contact', CONTATO);
    expect(screen.queryByText('foto-ana.jpg')).not.toBeInTheDocument();

    marcarRemetente('contact', CONTATO);
    expect(screen.getByText('foto-ana.jpg')).toBeInTheDocument();
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('files-filter-trigger').textContent).toBe('Filtros');
  });

  it('o funil vale JUNTO com período, tipo e busca', () => {
    renderTab();

    // 1) período: "Últimos 7 dias" tira a foto de 20 dias atrás (da Ana).
    escolherAtalho('Últimos 7 dias');
    expect(screen.queryByText('foto-ana.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('foto-cliente.jpg')).toBeInTheDocument();

    // 2) remetente: só o que é do usuário logado.
    marcarRemetente('self', 'Você');
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByText('foto-cliente.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('audio-equipe.ogg')).not.toBeInTheDocument();

    // 3) tipo: fora de "Docs" sobra o vazio honesto do tipo (não o "deste remetente").
    fireEvent.click(screen.getByText('Imagens'));
    expect(screen.getByText('Nenhum arquivo deste tipo')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Docs'));
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();

    // 4) busca: casa com o arquivo do recorte e não traz de volta o que o funil tirou.
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'contrato' } });
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'foto' } });
    expect(screen.getByText('Nada corresponde a "foto"')).toBeInTheDocument();
  });

  it('período sem nenhum arquivo do remetente marcado: estado próprio, opção continua visível e o botão volta a todos', () => {
    renderTab();

    // A foto da Ana é de 20 dias atrás: marcada, o período de 7 dias não casa com nada.
    marcarRemetente('agent:p-2', 'Ana Atendente');
    expect(screen.getByText('foto-ana.jpg')).toBeInTheDocument();

    escolherAtalho('Últimos 7 dias');
    expect(screen.getByText('Nenhum arquivo deste remetente')).toBeInTheDocument();
    // Nunca "Nenhum arquivo nesta conversa" (mentira) nem a opção marcada sumindo do painel.
    expect(screen.queryByText('Nenhum arquivo nesta conversa')).not.toBeInTheDocument();
    const linha = within(abrirFunil()).getByTestId('files-sender-agent:p-2');
    expect(within(linha).getByRole('checkbox', { name: 'Ana Atendente' })).toBeChecked();
    expect(linha).toHaveTextContent('Ana Atendente0');

    fireEvent.click(screen.getByRole('button', { name: /Ver todos os remetentes/ }));
    expect(screen.getByText('foto-cliente.jpg')).toBeInTheDocument();
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('audio-equipe.ogg')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo deste remetente')).not.toBeInTheDocument();
    // O período continua de pé: quem foi tirado por ele segue fora.
    expect(screen.queryByText('foto-ana.jpg')).not.toBeInTheDocument();
  });

  it('o remetente marcado sobrevive a sair e voltar na mesma conversa (recorte de sessão)', () => {
    const { unmount } = renderTab();
    marcarRemetente('self', 'Você');
    unmount();

    renderTab();
    expect(screen.getByText('meu-contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByText('foto-cliente.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-filter-trigger').textContent).toBe('Filtros1');
  });
});
