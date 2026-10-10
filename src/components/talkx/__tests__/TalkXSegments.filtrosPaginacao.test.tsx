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
 * TL-135c (X114 · tela 02) — filtros e paginação da biblioteca de segmentos.
 *
 * O TalkXSegments REAL é renderizado (hook real); só a fronteira de rede é
 * mockada (leitura de `talkx_segments`, RPC dos KPIs e RPC de audiência). Cada
 * caso dispara o evento do usuário e confere o que a TELA mostra:
 *
 * 1. tag + proprietário combinados recortam a lista (e as opções de tag saem dos
 *    próprios segmentos, coluna `tags` de X101);
 * 2. "Limpar filtros" zera o recorte e devolve a URL a um endereço compartilhável,
 *    sem apagar os parâmetros do módulo (`tab`);
 * 3. o recorte chega PRONTO por um endereço compartilhado (ida: URL -> tela),
 *    inclusive uma página fora do intervalo, que cai na última existente;
 * 4. paginação: 10 por página é o padrão, a escolha muda lista e URL e fica
 *    guardada POR USUÁRIO (outro operador continua no padrão);
 * 5. o status "Rascunho" (X101) filtra de verdade.
 *
 * Sem a implementação deste cartão todos os casos falham: a tela não lê a URL,
 * não guarda preferência e não tem filtro de tag/proprietário/rascunho.
 */

const AGORA = '2026-10-01T10:00:00.000Z';

const ANA = { id: 'u-ana', name: 'Ana Silva' };
const BRUNO = { id: 'u-bruno', name: 'Bruno Dias' };

interface SegmentoFixture {
  id: string; name: string; description: string | null; origin: string; status: string;
  is_favorite: boolean; rules: { groups: never[] }; estimated_count: number; last_used_at: string | null;
  created_by: string | null; tags: string[]; created_at: string; updated_at: string;
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
    tags: [],
    created_at: AGORA,
    updated_at: AGORA,
    creator: { name: ANA.name },
    ...extra,
  };
}

/** Cartela pequena (filtros) e cartela de 12 (paginação/preferência). */
function cartelaDeFiltros(): SegmentoFixture[] {
  return [
    segmento(1, { name: 'Clientes VIP', tags: ['VIP', 'Alto valor'] }),
    segmento(2, { name: 'Clientes recorrentes', tags: ['VIP'], created_by: BRUNO.id, creator: { name: BRUNO.name } }),
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
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: dados.segments, error: null }) }) }),
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

/** "Mostrando 1 a 10 de 12 segmentos" — a contagem que o rodapé exibe. */
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
});

describe('TalkXSegments · filtros e paginação da biblioteca (TL-135c)', () => {
  it('filtra por tag e proprietário combinados, com as opções de tag vindo dos segmentos', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    // A opção de tag é a coluna `tags` (X101) lida dos próprios segmentos.
    escolherNoSelect('Tag', 'VIP');
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Clientes recorrentes')).toBeTruthy();
    expect(screen.queryByText('Base geral')).toBeNull();
    expect(params().get('segtag')).toBe('VIP');

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

    escolherNoSelect('Tag', 'VIP');
    escolherNoSelect('Proprietário', 'Bruno Dias');
    expect(screen.queryByText('Base geral')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    // Todo o recorte desta fatia volta ao padrão…
    expect(screen.getByText('Base geral')).toBeTruthy();
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Rascunho novo')).toBeTruthy();
    // …e o endereço fica limpo, sem apagar os parâmetros do módulo (a aba).
    expect(window.location.search).toBe('?tab=segments');
  });

  it('recebe o recorte pronto por um endereço compartilhado (URL -> tela)', async () => {
    window.history.replaceState({}, '', '/?tab=segments&segtag=VIP&segproprietario=u-ana&segstatus=active');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.queryByText('Clientes recorrentes')).toBeNull();
    expect(screen.queryByText('Base geral')).toBeNull();
    // O recorte da URL aparece na própria barra de filtros.
    expect(screen.getByRole('combobox', { name: 'Tag' }).textContent).toContain('VIP');
    expect(screen.getByRole('combobox', { name: 'Proprietário' }).textContent).toContain('Ana Silva');
  });

  it('página fora do intervalo cai na última existente, e é ela que fica na URL', async () => {
    dados.segments = cartelaDe12();
    window.history.replaceState({}, '', '/?segpagina=9');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 11');

    expect(rodape()).toBe('Mostrando 11 a 12 de 12 segmentos');
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

  it('paginação: 10 por página por padrão e a escolha fica guardada por usuário', async () => {
    dados.segments = cartelaDe12();
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');

    // Padrão do plano: 10 por página.
    expect(rodape()).toBe('Mostrando 1 a 10 de 12 segmentos');
    expect(linhasVisiveis()).toBe(10);

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
    expect(rodape()).toBe('Mostrando 1 a 10 de 12 segmentos');
  });

  it('oferece a opção "Sem proprietário" no filtro de proprietário e recorta só os sem dono', async () => {
    dados.segments = [
      ...cartelaDeFiltros(),
      segmento(9, { name: 'Órfão da base', created_by: null, creator: null }),
    ];
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Órfão da base');

    // A opção existe mesmo para o segmento que não aparece na lista de criadores.
    escolherNoSelect('Proprietário', 'Sem proprietário');
    expect(screen.getByText('Órfão da base')).toBeTruthy();
    expect(screen.queryByText('Clientes VIP')).toBeNull();
    expect(screen.queryByText('Clientes recorrentes')).toBeNull();
    expect(params().get('segproprietario')).toBe('sem-proprietario');

    // O item "Todos" (sentinela 'all' da barra) devolve a lista inteira.
    escolherNoSelect('Proprietário', 'Todos');
    expect(screen.getByText('Clientes VIP')).toBeTruthy();
    expect(screen.getByText('Órfão da base')).toBeTruthy();
    expect(params().get('segproprietario')).toBeNull();
  });

  it('segporpagina chega pela URL e os filtros continuam na URL ao paginar', async () => {
    dados.segments = cartelaDe12();
    window.history.replaceState({}, '', '/?segorigem=zapp&segporpagina=8');
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Segmento 1');

    // O tamanho de página pedido pelo endereço vale na tela e fica na URL.
    expect(rodape()).toBe('Mostrando 1 a 8 de 12 segmentos');
    expect(params().get('segporpagina')).toBe('8');
    expect(params().get('segorigem')).toBe('zapp');

    // Paginar mantém os filtros na URL (não é o recorte que se perde na página).
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(rodape()).toBe('Mostrando 9 a 12 de 12 segmentos');
    expect(params().get('segpagina')).toBe('2');
    expect(params().get('segorigem')).toBe('zapp');
    expect(params().get('segporpagina')).toBe('8');

    // Trocar o tamanho de página sincroniza `segporpagina` sem largar os filtros.
    abrirSeletorDeTamanho();
    fireEvent.click(screen.getByRole('option', { name: '20 por página' }));
    expect(params().get('segporpagina')).toBe('20');
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

    expect(rodape()).toBe('Mostrando 1 a 10 de 12 segmentos');
    expect(window.localStorage.getItem(segmentLibraryPageSizeKey('user-1'))).toBe('10');
    expect(params().get('segporpagina')).toBeNull();
  });

  it('filtrar preserva o estado do roteador em vez de apagá-lo (replaceState sem null)', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await screen.findByText('Clientes VIP');

    escolherNoSelect('Tag', 'VIP');

    const estado = window.history.state as { idx?: number; key?: string; seglib?: boolean };
    expect(estado.idx).toBe(2);
    expect(estado.key).toBe('rota-base');
    expect(estado.seglib).toBe(true);
  });
});