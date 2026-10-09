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
 * Filtro por DATA na aba Arquivos (F05/F06) — componente REAL, com a lista vinda do
 * `useContactMedia` mockado (o hook de dados é de outro cartão) e o resto do caminho
 * verdadeiro: seletor, estado de sessão, `filesSort` e `filesPeriod`.
 *
 * As contagens dos chips continuam vindo da RPC (mock) — é o que o teste prova ao comparar
 * "sem período" (RPC) com "com período" (recorte carregado).
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
/** Meio-dia local de N dias atrás: bem dentro do dia, longe de qualquer virada. */
const diasAtras = (n: number) => new Date(Date.now() - n * DIA_MS).toISOString();
/** Mesma coisa como `Date` — o "Até" do período personalizado é uma data, não um texto. */
const diasAtrasData = (n: number) => new Date(Date.now() - n * DIA_MS);

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
  // A LISTA de páginas é do mock: cada re-render relê `media` (como o React Query faria ao
  // chegar a página seguinte). O elemento é recriado a cada vez de propósito — repetir o MESMO
  // objeto faz o React pular a renderização do filho e o teste passaria por engano.
  return { ...view, rerenderTab: () => view.rerender(build()) };
}

/** Gatilho do seletor de período (o primeiro botão dentro do filtro; o X vem depois). */
function gatilhoPeriodo() {
  return within(screen.getByTestId('files-period-filter')).getAllByRole('button')[0];
}

function escolherAtalho(nome: string) {
  fireEvent.click(gatilhoPeriodo());
  fireEvent.click(screen.getByRole('button', { name: nome }));
}

/** Clica um dia do calendário: grade 0 = "De", grade 1 = "Até". */
function clicarDia(indiceTabela: number, dia: number) {
  // Cada dia é um <button role="gridcell">; os dias de fora que estão no futuro vêm `disabled`.
  const celulas = within(screen.getAllByRole('grid')[indiceTabela]).getAllByRole('gridcell');
  const alvo = celulas.find((celula) => celula.textContent === String(dia) && !celula.hasAttribute('disabled'));
  if (!alvo) throw new Error(`dia ${dia} não encontrado/enabled na tabela ${indiceTabela}`);
  fireEvent.click(alvo);
}

/**
 * Refazer 1: semente da sessão da conversa com período personalizado de UMA ponta só — o MESMO
 * estado que o calendário grava quando o operador escolhe apenas o "Até" (`period: 'custom'` com
 * `customFrom: null`). Semear (em vez de clicar) mantém o teste independente do dia do mês: o
 * "Até" fica sempre ANTES dos itens carregados, que é o cenário da recusa.
 */
function semearPeriodoSoAte(customTo: Date) {
  writeFilesViewSession(filesViewSessionKey('user-1', 'contact-1'), {
    sort: 'recent',
    typeFilter: 'all',
    search: '',
    period: 'custom',
    customFrom: null,
    customTo,
  });
}

describe('FilesTab — filtro por data (F05)', () => {
  it('sem período o cabeçalho e os chips continuam vindo da RPC', () => {
    usarMidia([
      item({ id: 'hoje', filename: 'foto-hoje.jpg' }),
      item({ id: 'antiga', filename: 'foto-antiga.jpg', created_at: diasAtras(20) }),
    ]);
    renderTab();

    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent(/^Imagens2$/);
    expect(screen.getByText('foto-antiga.jpg')).toBeInTheDocument();
  });

  it('"Últimos 7 dias" filtra pela data de envio e recalcula cabeçalho e chips', () => {
    usarMidia([
      item({ id: 'hoje', filename: 'foto-hoje.jpg' }),
      item({ id: 'contrato', filename: 'contrato-semana.pdf', type: 'document', created_at: diasAtras(3) }),
      item({ id: 'antiga', filename: 'foto-antiga.jpg', created_at: diasAtras(20) }),
    ]);
    renderTab();

    escolherAtalho('Últimos 7 dias');

    expect(screen.getByText('foto-hoje.jpg')).toBeInTheDocument();
    expect(screen.getByText('contrato-semana.pdf')).toBeInTheDocument();
    expect(screen.queryByText('foto-antiga.jpg')).not.toBeInTheDocument();

    // Cabeçalho e chips deixam de contar a conversa inteira (RPC) e passam a contar o período.
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');
    expect(screen.getByText('Imagens').closest('button')).toHaveTextContent(/^Imagens1$/);
    expect(screen.getByText('Docs').closest('button')).toHaveTextContent(/^Docs1$/);
    expect(gatilhoPeriodo()).toHaveTextContent('Últimos 7 dias');
  });

  it('o período se combina com o tipo e com a busca', () => {
    usarMidia([
      item({ id: 'hoje', filename: 'foto-hoje.jpg' }),
      item({ id: 'antiga', filename: 'foto-antiga.jpg', created_at: diasAtras(20) }),
      item({ id: 'contrato', filename: 'contrato-semana.pdf', type: 'document', created_at: diasAtras(2) }),
    ]);
    renderTab();

    escolherAtalho('Últimos 7 dias');
    fireEvent.change(screen.getByPlaceholderText('Buscar arquivos...'), { target: { value: 'foto' } });
    expect(screen.getByText('foto-hoje.jpg')).toBeInTheDocument();
    // O arquivo de mesmo nome fora do período NÃO volta pela busca.
    expect(screen.queryByText('foto-antiga.jpg')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Docs'));
    expect(screen.queryByText('foto-hoje.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('contrato-semana.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Nada corresponde a "foto"')).toBeInTheDocument();
  });

  it('o X do seletor limpa o filtro e a lista volta inteira', () => {
    usarMidia([
      item({ id: 'hoje', filename: 'foto-hoje.jpg' }),
      item({ id: 'antiga', filename: 'foto-antiga.jpg', created_at: diasAtras(20) }),
    ]);
    renderTab();

    escolherAtalho('Hoje');
    expect(screen.queryByText('foto-antiga.jpg')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remover filtro de data'));
    expect(screen.getByText('foto-antiga.jpg')).toBeInTheDocument();
    expect(gatilhoPeriodo()).toHaveTextContent('Qualquer data');
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('2 arquivos');
  });

  it('período De/Até no calendário filtra pela data de envio', () => {
    const hoje = new Date();
    const primeiroDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
    const antigo = new Date(hoje.getTime() - 40 * DIA_MS);

    usarMidia([
      item({ id: 'mes', filename: 'arquivo-do-mes.jpg', created_at: primeiroDoMes.toISOString() }),
      item({ id: 'fora', filename: 'arquivo-de-fora.jpg', created_at: antigo.toISOString() }),
    ]);
    renderTab();

    fireEvent.click(gatilhoPeriodo());
    clicarDia(0, 1); // De = dia 1 do mês corrente
    clicarDia(1, hoje.getDate()); // Até = hoje

    expect(screen.getByText('arquivo-do-mes.jpg')).toBeInTheDocument();
    expect(screen.queryByText('arquivo-de-fora.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-total-count')).toHaveTextContent('1 arquivo');
    expect(gatilhoPeriodo()).toHaveTextContent('—');
  });

  it('estado vazio do período: avisa e limpa pelo botão', () => {
    usarMidia([item({ id: 'antiga', filename: 'foto-antiga.jpg', created_at: diasAtras(40) })]);
    renderTab();

    escolherAtalho('Últimos 7 dias');
    expect(screen.getByText('Nenhum arquivo neste período')).toBeInTheDocument();
    expect(screen.queryByText('foto-antiga.jpg')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Limpar período/ }));
    expect(screen.getByText('foto-antiga.jpg')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();
  });

  it('com período ativo carrega páginas antigas até passar do início do período', async () => {
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia(
      [item({ id: 'hoje', filename: 'foto-hoje.jpg' }), item({ id: 'tres-dias', filename: 'foto-3dias.jpg', created_at: diasAtras(3) })],
      { hasMore: true, fetchNextPage },
    );
    const { rerenderTab } = renderTab();

    escolherAtalho('Últimos 7 dias');
    // O item mais antigo carregado ainda está dentro do período: precisa buscar a página antiga.
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));

    // Chega a 2ª página, ainda dentro do período: pede de novo.
    media.items = [
      ...media.items,
      item({ id: 'seis-dias', filename: 'foto-6dias.jpg', created_at: diasAtras(6) }),
    ];
    rerenderTab();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(2));
    expect(screen.getByText('foto-6dias.jpg')).toBeInTheDocument();

    // Chega a 3ª página, já ANTERIOR ao início do período: para de pedir e mantém a lista.
    media.items = [...media.items, item({ id: 'vinte-dias', filename: 'foto-20dias.jpg', created_at: diasAtras(20) })];
    rerenderTab();
    await waitFor(() => expect(screen.getByText('foto-hoje.jpg')).toBeInTheDocument());
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('foto-20dias.jpg')).not.toBeInTheDocument();
  });

  it('sem período ativo não dispara o carregamento automático', () => {
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia([item({ id: 'hoje', filename: 'foto-hoje.jpg' })], { hasMore: true, fetchNextPage });
    renderTab();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

/**
 * Refazer 1 (recusa do revisor): com período personalizado SÓ com "Até" a lista `created_at desc`
 * pode ter as primeiras páginas inteiras DEPOIS do limite `to`. Nesse caso a varredura do período
 * tem de continuar carregando páginas antigas — e a tela não pode anunciar "Nenhum arquivo neste
 * período" antes de a varredura terminar.
 */
describe('FilesTab — período personalizado só com "Até" (refazer 1)', () => {
  it('carrega páginas antigas até cruzar o "Até" e só então para', async () => {
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia(
      [
        item({ id: 'nova-1', filename: 'nova-1.jpg' }),
        item({ id: 'nova-2', filename: 'nova-2.jpg' }),
      ],
      { hasMore: true, fetchNextPage },
    );
    semearPeriodoSoAte(diasAtrasData(5));
    const { container, rerenderTab } = renderTab();

    // Os dois itens carregados são mais NOVOS que o "Até": nenhum casa, mas ainda há páginas.
    expect(screen.queryByText('nova-1.jpg')).not.toBeInTheDocument();
    // A recusa do revisor começava aqui: a tela anunciava vazio com páginas antigas ainda por vir.
    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo nesta conversa')).not.toBeInTheDocument();
    // No lugar do vazio, a tela diz que está buscando (e o modo mostra o skeleton de carregamento —
    // mesma prova de `FilesContent.test.tsx`: 6 cartões pulsando).
    expect(screen.getByTestId('files-pagination-notice')).toHaveTextContent(/^Buscando entre os 2 carregados/);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(6);

    // A recusa: a tela TEM de pedir a página antiga (antes o efeito parava no `from === null`).
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();

    // Chega a página antiga: o item que casa com o "Até" aparece e a varredura para de pedir.
    media.items = [
      ...media.items,
      item({ id: 'antiga', filename: 'antiga.jpg', created_at: diasAtras(10) }),
    ];
    rerenderTab();
    await waitFor(() => expect(screen.getByText('antiga.jpg')).toBeInTheDocument());
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
  });

  it('ao atingir o teto de páginas a varredura termina sem skeleton infinito', async () => {
    // Cada página traz um item mais novo que o "Até" (o limite nunca é cruzado), então a varredura
    // só pode parar no teto. A lista fica com UM item: o que este teste precisa do mock é "hasMore
    // com o item mais antigo ainda DEPOIS do `to`", não o acúmulo de 30 mil itens de 500 páginas.
    const fetchNextPage = vi.fn().mockResolvedValue({ hasNextPage: true });
    usarMidia([item({ id: 'pagina-0', filename: 'nova.jpg' })], { hasMore: true, fetchNextPage });
    semearPeriodoSoAte(diasAtrasData(5));
    const { container, rerenderTab } = renderTab();

    expect(screen.queryByText('Nenhum arquivo neste período')).not.toBeInTheDocument();
    for (let pagina = 1; pagina <= MAX_PAGES_TO_LOAD_ALL + 2; pagina += 1) {
      // Página N minutos mais antiga que a N-1 — e ainda assim dentro das últimas horas: segue
      // mais nova que o "Até" (5 dias atrás), como as primeiras páginas da conversa real.
      media.items = [item({ id: `pagina-${pagina}`, filename: 'nova.jpg', created_at: new Date(Date.now() - pagina * 60_000).toISOString() })];
      rerenderTab();
    }

    // Teto atingido: a varredura para de pedir (não fica requisitando página para sempre)...
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(MAX_PAGES_TO_LOAD_ALL));
    // ...e a tela sai do skeleton: sem nada no período, mostra o aviso (nunca carregando para sempre).
    await waitFor(() => expect(screen.getByText('Nenhum arquivo neste período')).toBeInTheDocument());
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    expect(fetchNextPage).toHaveBeenCalledTimes(MAX_PAGES_TO_LOAD_ALL);
  });
});
