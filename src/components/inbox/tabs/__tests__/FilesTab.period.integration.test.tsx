import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FilesTab, MAX_PAGES_TO_LOAD_ALL } from '../FilesTab';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import {
  __resetFilesViewSession,
  filesViewSessionKey,
  writeFilesViewSession,
} from '@/hooks/chat/useFilesViewState';

/**
 * F07 — casos ADVERSARIAIS do filtro por DATA na aba Arquivos, no COMPONENTE REAL.
 *
 * Complementa `FilesTab.periodo.test.tsx` (F05/F06). O que este arquivo ataca e aquele nao:
 * virada de ANO e de MES (fevereiro curto) pelo intervalo personalizado, intervalo INVERTIDO
 * gravado na sessao, conversa sem arquivo no periodo convivendo com data invalida, mais de 60
 * arquivos em paginas de 60 de verdade, o teto de paginas pelo caminho do "De" e a combinacao
 * periodo + tipo + busca com o MESMO nome dentro e fora do periodo.
 *
 * A fronteira dublada e so `useContactMedia` (o hook de dados, de outro cartao): o caminho
 * verdadeiro — seletor, estado de sessao, `filesPeriod`, `filesSort`, contadores — roda inteiro.
 */

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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: vi.fn(),
    storage: { from: () => ({ createSignedUrls: vi.fn() }) },
  },
}));

beforeEach(() => {
  __resetFilesViewSession();
  localStorage.clear();
  vi.clearAllMocks();
});

const DIA_MS = 24 * 60 * 60 * 1000;
const AGORA = () => new Date().toISOString();
const diasAtras = (n: number) => new Date(Date.now() - n * DIA_MS).toISOString();
const diasAtrasData = (n: number) => new Date(Date.now() - n * DIA_MS);
/** Instante LOCAL: o recorte e por dia do navegador (America/Sao_Paulo), nunca pelo ISO em UTC. */
const localData = (ano: number, mes: number, dia: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(ano, mes - 1, dia, h, mi, s, ms);
const localIso = (ano: number, mes: number, dia: number, h = 0, mi = 0, s = 0, ms = 0) =>
  localData(ano, mes, dia, h, mi, s, ms).toISOString();

function item(overrides: Partial<ContactMediaItem> & { id: string }): ContactMediaItem {
  const filename = overrides.filename ?? `${overrides.id}.jpg`;
  return {
    url: `https://x/${overrides.id}.jpg`,
    type: 'image',
    filename,
    displayName: filename,
    extension: 'jpg',
    senderLabel: null,
    created_at: AGORA(),
    caption: null,
    mimetype: 'image/jpeg',
    size: 1024,
    meta: null,
    sender: 'contact',
    ...overrides,
  };
}

interface MediaState {
  items: ContactMediaItem[];
  hasMore: boolean;
  fetchNextPage: () => Promise<{ hasNextPage: boolean } | undefined>;
}

let media: MediaState;
let counts: { all: number; image: number; video: number; audio: number; document: number };

function usarMidia(items: ContactMediaItem[], overrides: Partial<MediaState> = {}) {
  media = {
    items,
    hasMore: false,
    fetchNextPage: vi.fn().mockResolvedValue({ hasNextPage: false }),
    ...overrides,
  };
  counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    video: items.filter((i) => i.type === 'video').length,
    audio: items.filter((i) => i.type === 'audio').length,
    document: items.filter((i) => i.type === 'document').length,
  };
}

function renderTab() {
  mockUseContactMedia.mockImplementation(() => ({
    ...media,
    isLoading: false,
    isFetchingNextPage: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }));
  mockUseContactMediaCounts.mockImplementation(() => ({ counts, isLoading: false, isError: false, refetch: vi.fn() }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const build = () => (
    <QueryClientProvider client={qc}>
      <FilesTab contactId="contact-1" contactName="Ana Cliente" />
    </QueryClientProvider>
  );
  const view = render(build());
  // A LISTA de paginas e do mock: cada re-render rele `media` (como o React Query faria ao chegar
  // a pagina seguinte). O elemento e recriado de proposito — repetir o MESMO objeto faria o React
  // pular a renderizacao do filho e o teste passaria por engano.
  return { ...view, rerenderTab: () => view.rerender(build()) };
}

/** Gatilho do seletor de periodo (o primeiro botao dentro do filtro; o X vem depois). */
function gatilhoPeriodo() {
  return within(screen.getByTestId('files-period-filter')).getAllByRole('button')[0];
}

function escolherAtalho(nome: string) {
  fireEvent.click(gatilhoPeriodo());
  fireEvent.click(screen.getByRole('button', { name: nome }));
}

/**
 * Semeia o periodo personalizado direto na sessao da conversa — o MESMO estado que o calendario
 * grava. Datas de CALENDARIO fixas (nao "N dias atras"): e o que torna a virada de ano/mes
 * deterministica, sem depender do dia em que a suite roda.
 */
function semearPeriodo(customFrom: Date | null, customTo: Date | null) {
  writeFilesViewSession(filesViewSessionKey('user-1', 'contact-1'), {
    sort: 'recent',
    typeFilter: 'all',
    search: '',
    period: 'custom',
    customFrom,
    customTo,
  });
}

/** Uma pagina do keyset: 60 itens de 1 em 1 minuto a partir de `baseMs`. */
function pagina(prefixo: string, baseMs: number, quantidade = 60): ContactMediaItem[] {
  return Array.from({ length: quantidade }, (_, i) =>
    item({
      id: `${prefixo}-${i}`,
      filename: `${prefixo}-${i}.jpg`,
      created_at: new Date(baseMs - i * 60_000).toISOString(),
    }),
  );
}

describe('FilesTab (adversarial) — viradas de ANO e de MES no periodo personalizado', () => {
  it('31/12/2025 a 02/01/2026: as duas pontas do dia e a virada de ano entram; nenhum vizinho entra', () => {
    usarMidia([
      item({ id: 'lixo', filename: 'lixo.jpg', created_at: 'nao-e-data' }),
      item({ id: 'fora-depois', filename: 'fora-depois.jpg', created_at: localIso(2026, 1, 3, 0, 0, 0, 0) }),
      item({ id: 'dentro-fim', filename: 'dentro-fim.jpg', created_at: localIso(2026, 1, 2, 23, 59, 59, 999) }),
      item({ id: 'dentro-ano-novo', filename: 'dentro-ano-novo.jpg', created_at: localIso(2026, 1, 1, 0, 0, 0, 0) }),
      item({ id: 'dentro-vespera', filename: 'dentro-vespera.jpg', created_at: localIso(2025, 12, 31, 23, 59, 59, 999) }),
      item({ id: 'dentro-inicio', filename: 'dentro-inicio.jpg', created_at: localIso(2025, 12, 31, 0, 0, 0, 0) }),
      item({ id: 'fora-antes', filename: 'fora-antes.jpg', created_at: localIso(2025, 12, 30, 23, 59, 59, 999) }),
    ]);
    semearPeriodo(localData(2025, 12, 31), localData(2026, 1, 2));
    renderTab();

    for (const id of ['dentro-inicio', 'dentro-vespera', 'dentro-ano-novo', 'dentro-fim']) {
      expect(screen.getByText(`${id}.jpg`)).toBeInTheDocument();
    }
    for (const id of ['fora-antes', 'fora-depois', 'lixo']) {
      expect(screen.queryByText(`${id}.jpg`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('4 arquivos');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent(/^Imagens4$/);
  });

  it('28/02/2026 a 01/03/2026 (fevereiro curto): a virada de mes entra inteira e os vizinhos ficam fora', () => {
    usarMidia([
      item({ id: 'mar-fora', filename: 'mar-fora.jpg', created_at: localIso(2026, 3, 2, 0, 0, 0, 0) }),
      item({ id: 'mar-fim', filename: 'mar-fim.jpg', created_at: localIso(2026, 3, 1, 23, 59, 59, 999) }),
      item({ id: 'mar-inicio', filename: 'mar-inicio.jpg', created_at: localIso(2026, 3, 1, 0, 0, 0, 0) }),
      item({ id: 'fev-fim', filename: 'fev-fim.jpg', created_at: localIso(2026, 2, 28, 23, 59, 59, 999) }),
      item({ id: 'fev-inicio', filename: 'fev-inicio.jpg', created_at: localIso(2026, 2, 28, 0, 0, 0, 0) }),
      item({ id: 'fev-fora', filename: 'fev-fora.jpg', created_at: localIso(2026, 2, 27, 23, 59, 59, 999) }),
    ]);
    semearPeriodo(localData(2026, 2, 28), localData(2026, 3, 1));
    renderTab();

    for (const id of ['fev-inicio', 'fev-fim', 'mar-inicio', 'mar-fim']) {
      expect(screen.getByText(`${id}.jpg`)).toBeInTheDocument();
    }
    for (const id of ['fev-fora', 'mar-fora']) {
      expect(screen.queryByText(`${id}.jpg`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('4 arquivos');
  });

  it('intervalo invertido gravado na sessao e normalizado pelo componente (De depois do Ate)', () => {
    usarMidia([
      item({ id: 'fora-11', filename: 'fora-11.jpg', created_at: localIso(2026, 3, 11, 0, 0, 0, 0) }),
      item({ id: 'dentro-10', filename: 'dentro-10.jpg', created_at: localIso(2026, 3, 10, 23, 59, 59, 999) }),
      item({ id: 'dentro-5', filename: 'dentro-5.jpg', created_at: localIso(2026, 3, 5, 0, 0, 0, 0) }),
      item({ id: 'fora-4', filename: 'fora-4.jpg', created_at: localIso(2026, 3, 4, 23, 59, 59, 999) }),
    ]);
    // O calendario nao deixa montar invertido, mas a sessao pode carregar esse estado.
    semearPeriodo(localData(2026, 3, 10, 12, 0), localData(2026, 3, 5, 12, 0));
    renderTab();

    expect(screen.getByText('dentro-5.jpg')).toBeInTheDocument();
    expect(screen.getByText('dentro-10.jpg')).toBeInTheDocument();
    expect(screen.queryByText('fora-4.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('fora-11.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');
  });
});

describe('FilesTab (adversarial) — conversa sem arquivo no periodo', () => {
  /**
   * DEFEITO ENCONTRADO (fora dos arquivos deste cartão, relatado no cartão): um arquivo com
   * `created_at` inválido NAO chega a ser filtrado — o `FileCard` estoura antes, na primeira
   * renderização (sem período nenhum ainda), em `formatSmartDate` (`src/lib/formatters.ts`) →
   * `date-fns format` → `RangeError: Invalid time value`. Por isso o caso "data inválida" do
   * componente fica como `todo` honesto: o recorte da data inválida está provado por unidade em
   * `filesPeriod.adversarial.test.ts`; aqui a aba nem renderiza.
   */
  it.todo('arquivo com data inválida na conversa (sem período) não pode estourar a aba');

  it('vazio do periodo (nao "sem resultado"), contagem 0 e nenhum arquivo antigo', () => {
    usarMidia([item({ id: 'antigo', filename: 'antigo.jpg', created_at: diasAtras(40) })]);
    renderTab();

    escolherAtalho('Últimos 7 dias');

    // O vazio do PERIODO tem mensagem propria — nao confundir com "Nenhum arquivo nesta conversa"
    // nem com "Nada corresponde a busca".
    expect(screen.getByText('Nenhum arquivo neste período')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo nesta conversa')).not.toBeInTheDocument();
    expect(screen.queryByText('antigo.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('0 arquivos');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent(/^Imagens0$/);
  });

  it('Limpar periodo devolve a conversa inteira e sai do vazio do periodo', () => {
    usarMidia([item({ id: 'antigo', filename: 'antigo.jpg', created_at: diasAtras(40) })]);
    renderTab();

    escolherAtalho('Últimos 7 dias');
    expect(screen.getByText('Nenhum arquivo neste período')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Limpar período/ }));

    expect(screen.getByText('antigo.jpg')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('1 arquivo');
  });
});

describe('FilesTab (adversarial) — mais de 60 arquivos', () => {
  it('tres paginas de 60: a varredura busca a pagina antiga ate CRUZAR o inicio do periodo e para nela', async () => {
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia(pagina('p1', Date.now()), { hasMore: true, fetchNextPage });
    const { rerenderTab } = renderTab();

    escolherAtalho('Últimos 7 dias');
    // A 1a pagina inteira esta dentro do periodo: nao cruzou o inicio, tem de buscar a antiga.
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));

    // Chega a 2a pagina (2 dias atras, ainda dentro dos 7): pede de novo.
    media.items = [...media.items, ...pagina('p2', Date.now() - 2 * DIA_MS)];
    rerenderTab();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(2));

    // Chega a 3a pagina (10 dias atras: TODA anterior ao periodo) — cruzou o inicio, para.
    media.items = [...media.items, ...pagina('p3', Date.now() - 10 * DIA_MS)];
    rerenderTab();

    await waitFor(() => expect(screen.getByTestId('files-total-count')).toHaveTextContent('120 arquivos'));
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    expect(screen.getByText('p2-59.jpg')).toBeInTheDocument();
    expect(screen.queryByText('p3-0.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-pagination-notice')).toHaveTextContent('Buscando entre os 180 carregados');
  });

  it('o teto de paginas e um teto de SEGURANCA (500 paginas x 60 = 30 mil arquivos)', () => {
    expect(MAX_PAGES_TO_LOAD_ALL).toBeGreaterThanOrEqual(100);
  });

  it('caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito', async () => {
    // Cada pagina traz um item mais NOVO que o "De" (5 dias atras): o limite nunca e cruzado,
    // entao o unico freio possivel e o teto. O item esta DENTRO do periodo — a lista nao fica
    // vazia e da para medir o teto sem confundir com o vazio do periodo.
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia([item({ id: 'pagina-0', filename: 'dentro.jpg' })], { hasMore: true, fetchNextPage });
    semearPeriodo(diasAtrasData(5), null);
    const { container, rerenderTab } = renderTab();

    expect(screen.getByText('dentro.jpg')).toBeInTheDocument();
    for (let numeroDaPagina = 1; numeroDaPagina <= MAX_PAGES_TO_LOAD_ALL + 2; numeroDaPagina += 1) {
      media.items = [
        item({
          id: `pagina-${numeroDaPagina}`,
          filename: 'dentro.jpg',
          created_at: new Date(Date.now() - numeroDaPagina * 60_000).toISOString(),
        }),
      ];
      rerenderTab();
    }

    // Teto atingido: para de pedir (nunca requisita pagina para sempre)...
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(MAX_PAGES_TO_LOAD_ALL));
    // ...e a tela nao fica carregando: o arquivo do periodo segue visivel.
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    expect(screen.getByText('dentro.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('1 arquivo');

    // Uma pagina a mais chegando depois nao reabre a varredura.
    media.items = [item({ id: 'pagina-extra', filename: 'dentro.jpg' })];
    rerenderTab();
    expect(fetchNextPage).toHaveBeenCalledTimes(MAX_PAGES_TO_LOAD_ALL);
  });
});

describe('FilesTab (adversarial) — periodo + tipo + busca combinados', () => {
  it('mesmo nome dentro e fora do periodo, com tipo e busca por cima', () => {
    usarMidia([
      item({ id: 'foto-hoje', filename: 'foto.jpg', type: 'image' }),
      item({ id: 'foto-antiga', filename: 'foto.jpg', type: 'image', created_at: diasAtras(40) }),
      item({
        id: 'contrato-hoje',
        filename: 'contrato.pdf',
        type: 'document',
        caption: 'assinado pelo cliente',
      }),
      item({ id: 'contrato-antigo', filename: 'contrato.pdf', type: 'document', created_at: diasAtras(40) }),
    ]);
    renderTab();

    escolherAtalho('Últimos 7 dias');

    // O periodo corta as duas copias antigas; ficam as duas de hoje.
    expect(screen.getAllByText('foto.jpg')).toHaveLength(1);
    expect(screen.getAllByText('contrato.pdf')).toHaveLength(1);
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent(/^Imagens1$/);
    expect(screen.getByText('Docs').closest('button')).toHaveTextContent(/^Docs1$/);

    // Periodo + tipo: so o documento de hoje.
    fireEvent.click(screen.getByText('Docs'));
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
    // A contagem do cabecalho e do PERIODO (nao do tipo), como nas outras abas.
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');

    // Periodo + tipo + busca pela legenda: continua achando.
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'assinado' } });
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();

    // Busca que so existe fora do periodo nao pode trazer o arquivo antigo de volta.
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'foto' } });
    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('Nada corresponde a "foto"')).toBeInTheDocument();
  });
});
