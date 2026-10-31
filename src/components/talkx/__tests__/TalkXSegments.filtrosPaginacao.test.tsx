import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

/**
 * X115 (tela 02) — filtros e paginação da biblioteca de segmentos.
 *
 * O TalkXSegments REAL é renderizado (hook real); só a fronteira de rede é
 * mockada (leitura de `talkx_segments`, RPC dos KPIs e RPC de audiência). Cada
 * caso dispara o evento do usuário e confere o que a TELA mostra:
 *
 * 1. origem + proprietário combinados recortam a lista;
 * 2. "Limpar filtros" zera o recorte e devolve a URL a um endereço compartilhável,
 *    sem apagar os parâmetros do módulo (`tab`);
 * 3. o recorte chega PRONTO por um endereço compartilhado (ida: URL -> tela),
 *    inclusive uma página fora do intervalo, que cai na última existente;
 * 4. paginação: 8 por página é o padrão (o da main), a escolha muda lista e URL e
 *    fica guardada POR USUÁRIO (outro operador continua no padrão);
 * 5. o status "Rascunho" (X101) filtra de verdade;
 * 6. o filtro de Proprietário oferece "Sem proprietário" e o item "Todos", só
 *    recorta o que a consulta (RLS) já devolveu, e não apaga o `history.state`;
 * 7. paginar (e trocar o tamanho de página) preserva TODO o recorte na URL;
 * 8. "Limpar filtros" devolve o tamanho de página ao padrão e grava a escolha;
 * 9. voltar/avançar do navegador reaplica o recorte; sair da tela tira os `seg*`.
 *
 * NÃO há filtro por tag: a função de tags está sendo removida do sistema.
 */

const AGORA = '2026-10-01T10:00:00.000Z';

const ANA = { id: 'u-ana', name: 'Ana Silva' };
const BRUNO = { id: 'u-bruno', name: 'Bruno Dias' };

interface SegmentoFixture {
  id: string; name: string; description: string | null; origin: string; status: string;
  is_favorite: boolean; rules: { groups: never[] }; estimated_count: number; last_used_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  creator: { name: string } | null;
}

function segmento(i: number, extra: Partial<SegmentoFixture> = {}): SegmentoFixture {
  return {
    id: `seg-${i}`,
    name: `Segmento ${i}`,
    description: null,
    origin: 'zapp',
    status: 'active',
    is_favorite: false,
    rules: { groups: [] },
    estimated_count: 100 + i,
    last_used_at: null,
    created_by: ANA.id,
    created_at: AGORA,
    updated_at: AGORA,
    creator: { name: ANA.name },
    ...extra,
  };
}

/** Cartela pequena (filtros) e cartela de 12 (paginação/preferência). */
function cartelaDeFiltros(): SegmentoFixture[] {
  return [
    segmento(1, { name: 'Clientes VIP', origin: 'crm360' }),
    segmento(2, { name: 'Clientes recorrentes', origin: 'crm360', created_by: BRUNO.id, creator: { name: BRUNO.name } }),
    segmento(3, { name: 'Base geral' }),
    segmento(4, { name: 'Rascunho novo', status: 'draft' }),
  ];
}

function cartelaDe12(): SegmentoFixture[] {
  return Array.from({ length: 12 }, (_, i) => segmento(i + 1));
}

const dados = {
  segments: [] as SegmentoFixture[],
  usuario: 'user-1',
  /** Tabelas lidas pela tela: o filtro de proprietário não pode abrir outro caminho de leitura. */
  tabelasLidas: [] as string[],
};

const statsFixture = {
  generated_at: AGORA,
  timezone: 'America/Sao_Paulo',
  month_start: '2026-10-01',
  total_segments: 4,
  active_this_month: 3,
  active_previous_month: 2,
  active_delta: 1,
  crm360_connected: 0,
  crm360_previous_month: 0,
  crm360_delta: 0,
  conversion: {
    value_pct: null, previous_pct: null, delta_pp: null, has_data: false,
    deliveries: 0, conversions: 0, previous_deliveries: 0, previous_conversions: 0, min_deliveries: 100,
  },
  series: [],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string) =>
      Promise.resolve(
        name === 'talkx_segment_library_stats'
          ? { data: statsFixture, error: null }
          : { data: { eligible: 0, rows: [], has_more: false, next_after: null }, error: null },
      ),
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (tabela: string) => ({
    select: (colunas: string) => ({ order: () => ({ order: () => { dados.tabelasLidas.push(`${tabela}:${colunas}`); return Promise.resolve({ data: dados.segments, error: null }); } }) }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: dados.usuario, full_name: 'QA' }, user: { id: dados.usuario }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TalkXSegments } from '../TalkXSegments';
import { segmentLibraryPageSizeKey } from '@/hooks/integrations/useTalkXSegments';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** jsdom não implementa captura de ponteiro: o gatilho do Select (Radix) chama
 * `hasPointerCapture` no pointerdown que o abre. */
function abrirSelect(rotulo: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: rotulo }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
}

function escolherNoSelect(rotulo: string, opcao: string) {
  abrirSelect(rotulo);
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

/** O seletor de tamanho de página vive no rodapé da tabela e ainda não tem nome
 * acessível no kit (fica para o cartão de acessibilidade): o alvo é o combobox
 * DENTRO da linha "Mostrando …". */
function abrirSeletorDeTamanho() {
  const linha = screen.getByText(/^Mostrando/).parentElement as HTMLElement;
  fireEvent.pointerDown(within(linha).getByRole('combobox'), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
}

/** "Mostrando 1 a 8 de 12 segmentos" — a contagem que o rodapé exibe. */
function rodape(): string {
  return screen.getByText(/^Mostrando/).textContent ?? '';
}

function linhasVisiveis(): number {
  return screen.getAllByRole('button', { name: 'Favoritar' }).length;
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

beforeEach(() => {
  // Estado do roteador de mentira: filtrar NÃO pode apagá-lo (regressão do
  // `replaceState(null)` — o voltar/avançar perdia `idx` e `key`).
  window.history.replaceState({ idx: 2, key: 'rota-base' }, '', '/');
  window.localStorage.clear();
  dados.segments = cartelaDeFiltros();
  dados.usuario = 'user-1';
  dados.tabelasLidas = [];
});

describe('TalkXSegments · filtros e paginação da biblioteca (X115)', () => {
  it('filtra por origem e proprietário combinados', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Origem', 'CRM 360°');
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Clientes recorrentes')).toBeTruthy();
    expect(screen.queryByText('Base geral')).toBeNull();
    expect(params().get('segorigem')).toBe('crm360');

    // Combinado com proprietário: só o que é dos dois.
    escolherNoSelect('Proprietário', 'Ana Silva');
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.queryByText('Clientes recorrentes')).toBeNull();
    expect(screen.queryByText('Base geral')).toBeNull();
    expect(params().get('segproprietario')).toBe(ANA.id);
  });

  it('"Limpar filtros" zera o recorte e devolve a URL a um endereço compartilhável', async () => {
    window.history.replaceState({}, '', '/?tab=segments');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Origem', 'CRM 360°');
    escolherNoSelect('Proprietário', 'Bruno Dias');
    expect(screen.queryByText('Base geral')).toBeNull();
    expect(screen.queryByText('Clientes VIP')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    // Todo o recorte desta fatia volta ao padrão…
    expect(screen.getByText('Base geral')).toBeTruthy();
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Rascunho novo')).toBeTruthy();
    // …e o endereço fica limpo, sem apagar os parâmetros do módulo (a aba).
    expect(window.location.search).toBe('?tab=segments');
  });

  it('recebe o recorte pronto por um endereço compartilhado (URL -> tela)', async () => {
    window.history.replaceState({}, '', '/?tab=segments&segorigem=crm360&segproprietario=u-ana&segstatus=active');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.queryByText('Clientes recorrentes')).toBeNull();
    expect(screen.queryByText('Base geral')).toBeNull();
    // O recorte da URL aparece na própria barra de filtros.
    expect(screen.getByRole('combobox', { name: 'Origem' }).textContent).toContain('CRM 360°');
    expect(screen.getByRole('combobox', { name: 'Proprietário' }).textContent).toContain('Ana Silva');
  });

  it('página fora do intervalo cai na última existente, e é ela que fica na URL', async () => {
    dados.segments = cartelaDe12();
    window.history.replaceState({}, '', '/?segpagina=9');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 11');

    expect(rodape()).toBe('Mostrando 9 a 12 de 12 segmentos');
    expect(params().get('segpagina')).toBe('2');
  });

  it('filtra por status Rascunho (X101) sem quebrar os filtros existentes', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Status', 'Rascunho');

    expect(screen.getByText('Rascunho novo')).toBeTruthy();
    expect(screen.queryByText('Clientes VIP')).toBeNull();
    expect(params().get('segstatus')).toBe('draft');
  });

  it('paginação: 8 por página por padrão e a escolha fica guardada por usuário', async () => {
    dados.segments = cartelaDe12();
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');

    // Padrão da main preservado: 8 por página.
    expect(rodape()).toBe('Mostrando 1 a 8 de 12 segmentos');
    expect(linhasVisiveis()).toBe(8);

    // O seletor do kit funciona e a escolha vai para a lista e para a URL.
    abrirSeletorDeTamanho();
    fireEvent.click(screen.getByRole('option', { name: '20 por página' }));
    expect(rodape()).toBe('Mostrando 1 a 12 de 12 segmentos');
    expect(linhasVisiveis()).toBe(12);
    expect(params().get('segporpagina')).toBe('20');

    // Fica guardada PARA ESTE usuário…
    expect(window.localStorage.getItem(segmentLibraryPageSizeKey('user-1'))).toBe('20');

    // …e volta sozinha na próxima visita (URL limpa, sem o parâmetro).
    cleanup();
    window.history.replaceState({}, '', '/');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');
    expect(rodape()).toBe('Mostrando 1 a 12 de 12 segmentos');

    // Outro operador continua no padrão: a preferência não é global.
    cleanup();
    dados.usuario = 'user-2';
    window.history.replaceState({}, '', '/');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');
    expect(rodape()).toBe('Mostrando 1 a 8 de 12 segmentos');
  });

  it('oferece a opção "Sem proprietário" no filtro de proprietário e recorta só os sem dono', async () => {
    dados.segments = [
      ...cartelaDeFiltros(),
      segmento(9, { name: 'Órfão da base', created_by: null, creator: null }),
    ];
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Órfão da base');

    // A opção existe mesmo para o segmento que não aparece na lista de criadores.
    // Abrir o select prova as duas opções: o "Todos" (sentinela `all`) e o "Sem proprietário".
    abrirSelect('Proprietário');
    expect(screen.getByRole('option', { name: 'Todos' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Sem proprietário' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Sem proprietário' }));
    expect(screen.getByText('Órfão da base')).toBeTruthy();
    expect(screen.queryByText('Clientes VIP')).toBeNull();
    expect(screen.queryByText('Clientes recorrentes')).toBeNull();
    expect(params().get('segproprietario')).toBe('sem-proprietario');
    // Só recorta o que a consulta (sujeita à RLS) devolveu: nenhuma leitura extra de segmentos.
    expect(new Set(dados.tabelasLidas)).toEqual(new Set(['talkx_segments:*, creator:created_by(name)']));

    // O item "Todos" (sentinela 'all' da barra) devolve a lista inteira.
    escolherNoSelect('Proprietário', 'Todos');
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Órfão da base')).toBeTruthy();
    expect(params().get('segproprietario')).toBeNull();
  });

  it('segporpagina chega pela URL e os filtros continuam na URL ao paginar', async () => {
    dados.segments = cartelaDe12();
    // O recorte chega pronto: busca (`segq`), status (`segstatus`), origem (`segorigem`)
    // e tamanho (`segporpagina`). Não há `segbusca`/`segfavoritos`/`segminhas` neste
    // módulo — a busca é `segq` e a biblioteca não tem favoritos/meus (ver relato).
    window.history.replaceState({}, '', '/?segq=Segmento&segstatus=active&segorigem=zapp&segporpagina=10');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');

    // O tamanho de página pedido pelo endereço vale na tela e fica na URL.
    expect(rodape()).toBe('Mostrando 1 a 10 de 12 segmentos');
    expect(params().get('segporpagina')).toBe('10');
    expect(params().get('segorigem')).toBe('zapp');
    expect(params().get('segq')).toBe('Segmento');
    expect(params().get('segstatus')).toBe('active');

    // Paginar preserva TODO o recorte na URL (não é o recorte que se perde na página).
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(rodape()).toBe('Mostrando 11 a 12 de 12 segmentos');
    expect(params().get('segpagina')).toBe('2');
    expect(params().get('segq')).toBe('Segmento');
    expect(params().get('segstatus')).toBe('active');
    expect(params().get('segorigem')).toBe('zapp');
    expect(params().get('segporpagina')).toBe('10');

    // Trocar o tamanho de página sincroniza `segporpagina` sem largar os filtros.
    abrirSeletorDeTamanho();
    fireEvent.click(screen.getByRole('option', { name: '20 por página' }));
    expect(params().get('segporpagina')).toBe('20');
    expect(params().get('segq')).toBe('Segmento');
    expect(params().get('segorigem')).toBe('zapp');
  });

  it('"Limpar filtros" devolve o tamanho de página ao padrão e grava a escolha', async () => {
    dados.segments = cartelaDe12();
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');

    abrirSeletorDeTamanho();
    fireEvent.click(screen.getByRole('option', { name: '20 por página' }));
    expect(rodape()).toBe('Mostrando 1 a 12 de 12 segmentos');
    expect(window.localStorage.getItem(segmentLibraryPageSizeKey('user-1'))).toBe('20');

    // Ativa um filtro para o botão "Limpar filtros" aparecer e então limpa.
    escolherNoSelect('Status', 'Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(rodape()).toBe('Mostrando 1 a 8 de 12 segmentos');
    expect(window.localStorage.getItem(segmentLibraryPageSizeKey('user-1'))).toBe('8');
    expect(params().get('segporpagina')).toBeNull();
  });

  it('filtrar preserva o estado do roteador em vez de apagá-lo (replaceState sem null)', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Origem', 'CRM 360°');

    const estado = window.history.state as { idx?: number; key?: string; seglib?: boolean };
    expect(estado.idx).toBe(2);
    expect(estado.key).toBe('rota-base');
    expect(estado.seglib).toBe(true);
  });

  it('voltar/avançar do navegador reaplica o recorte do endereço', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    window.history.replaceState({}, '', '/?segstatus=draft');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByText('Rascunho novo')).toBeTruthy();
    expect(screen.queryByText('Clientes VIP')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Rascunho');
  });

  it('ao sair da tela os parâmetros seg* saem do endereço e os do módulo ficam', async () => {
    window.history.replaceState({}, '', '/?tab=segments&segstatus=active');
    const { unmount } = wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');
    expect(params().get('segstatus')).toBe('active');

    unmount();

    expect(window.location.search).toBe('?tab=segments');
  });

  it('o recorte preserva os parâmetros do módulo (view, tab) e não grava segtag', async () => {
    window.history.replaceState({}, '', '/?view=talkx&tab=segments&segstatus=active');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Origem', 'CRM 360°');

    expect(params().get('view')).toBe('talkx');
    expect(params().get('tab')).toBe('segments');
    expect(params().get('segstatus')).toBe('active');
    expect(params().get('segorigem')).toBe('crm360');
    expect(params().has('segtag')).toBe(false);
  });
});