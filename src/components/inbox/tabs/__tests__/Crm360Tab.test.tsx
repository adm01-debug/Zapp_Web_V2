import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import { readFileSync } from 'node:fs';
import { Crm360Tab } from '../Crm360Tab';
import type { Conversation } from '@/types/chat';
import type { Crm360Result } from '@/hooks/crm/useContactCrm360';

const mockUseContactCrm360 = vi.fn();
const mockUseContactLeadScore = vi.fn();
const mockAdvanceMutate = vi.fn();
const mockNavigateToView = vi.fn();
const mockCreateTask = vi.fn();
const mockUseContactEnrichedQuery = vi.fn(() => ({ data: undefined as unknown, isLoading: false }));

vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedQuery: (...args: unknown[]) => mockUseContactEnrichedQuery(...(args as [])),
}));

// Stub do editor (lazy): expõe o `contact` que o Crm360Tab monta, para provar o que chega ao form.
vi.mock('../../contact-details/EditContactDialog', () => ({
  EditContactDialog: ({ contact }: { contact: Record<string, unknown> }) => (
    <div data-testid="edit-contact-stub" data-contact={JSON.stringify(contact)} />
  ),
}));

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: (...args: unknown[]) => mockUseContactCrm360(...args),
  useContactLeadScore: (...args: unknown[]) => mockUseContactLeadScore(...args),
  useAdvanceDealStage: () => ({ mutate: mockAdvanceMutate, isPending: false }),
}));

// Controle da ação sugerida: o card "Próxima melhor ação" só renderiza o botão
// "Criar tarefa →" quando existe uma ação — sem isso o 3º link não entra no teste.
const h = vi.hoisted(() => ({ nextActions: [] as { label: string; description: string }[] }));

vi.mock('@/hooks/chat/useNextBestAction', () => ({
  useNextBestAction: () => ({ actions: h.nextActions, loading: false }),
}));

/**
 * Contraste real medido a partir do tokens.css (não de string fixa): o jsdom não tem
 * layout, então o axe marca `color-contrast` como "incomplete" e nunca como violação.
 * A prova do AA é a razão calculada do par de TEXTO `--primary-text` sobre o `--card`.
 */
const TOKENS_CSS = readFileSync('src/styles/tokens.css', 'utf8');
const DARK_TOKENS = TOKENS_CSS.split(/\.dark\s*\{/)[1] ?? '';

function tokenHsl(css: string, name: string) {
  const m = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(css);
  if (!m) throw new Error(`token --${name} ausente em tokens.css`);
  return { h: Number(m[1]) / 360, s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
}
function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] :
    h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
function luminancia([r, g, b]: [number, number, number]) {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function razaoContraste(fg: [number, number, number], bg: [number, number, number]) {
  const [alto, baixo] = [luminancia(fg), luminancia(bg)].sort((a, b) => b - a);
  return (alto + 0.05) / (baixo + 0.05);
}
// Cor de TEXTO realmente aplicada pelo link: o token vem da classe do componente (o par
// arbitrário `text-[hsl(var(--x))]` ou a semântica `text-primary`), nunca de um literal do teste.
const TEXT_TOKEN_CLASS = /text-\[hsl\(var\(--([a-z-]+)\)\)\]/;
const SEMANTIC_TEXT: Record<string, string> = { 'text-primary': 'primary' };
function tokenDeTexto(el: Element): string {
  const cls = el.className;
  const arb = TEXT_TOKEN_CLASS.exec(cls)?.[1];
  if (arb) return arb;
  const sem = Object.keys(SEMANTIC_TEXT).find((c) => cls.split(/\s+/).includes(c));
  if (sem) return SEMANTIC_TEXT[sem];
  throw new Error(`link sem cor de texto resolvível: "${cls}"`);
}

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ create: mockCreateTask, byDue: { overdue:[], today:[], tomorrow:[], upcoming:[], noDue:[], done7d:[], doneOlder:[] }, isLoading: false }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => mockNavigateToView(...args),
}));

const EMPTY_CRM360: Crm360Result = {
  purchases: [],
  openDeals: [],
  stages: [],
  currentStage: null,
  currentDeal: null,
  ticketMedio: null,
  ticketDeltaPct: null,
  interesses: [],
  pipeline: {
    propostas: { total: 0, count: 0 },
    negociacao: { total: 0, count: 0 },
    ganhos: { total: 0, count: 0 },
  },
  interacoes: [],
  resumo: { comprasTotal: 0, comprasCount: 0, propostas: 0, emAberto: 0 },
};

const conversation: Conversation = {
  id: 'conv-1',
  contact: {
    id: 'contact-1',
    name: 'Ana Cliente',
    phone: '5511999999999',
    company: null,
    job_title: null,
    created_at: '2026-01-15T10:00:00.000Z',
    conversation_status: 'open',
  },
  unreadCount: 0,
  status: 'open',
} as unknown as Conversation;

function renderTabWithRerender() {
  mockUseContactCrm360.mockReturnValue({ data: EMPTY_CRM360 });
  mockUseContactLeadScore.mockReturnValue({ data: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={qc}>
      <Crm360Tab conversation={conversation} messages={[]} onTabChange={vi.fn()} />
    </QueryClientProvider>
  );
  const r = render(ui());
  return { rerender: () => r.rerender(ui()) };
}

function renderTab(crm360: Partial<Crm360Result> | undefined = EMPTY_CRM360) {
  mockUseContactCrm360.mockReturnValue({ data: crm360 });
  mockUseContactLeadScore.mockReturnValue({ data: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTabChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <Crm360Tab conversation={conversation} messages={[]} onTabChange={onTabChange} />
    </QueryClientProvider>
  );
  return { onTabChange };
}

describe('Crm360Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.nextActions.length = 0;
  });

  it('renderiza a faixa de KPIs', () => {
    renderTab();
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
    expect(screen.getAllByTestId('kpi-cell')).toHaveLength(4);
  });

  it('mostra empty states honestos quando não há dados comerciais', () => {
    renderTab();
    expect(screen.getByText('Nenhuma compra registrada')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma proposta em aberto')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma negociação aberta')).toBeInTheDocument();
    expect(screen.getByText('Sem negociações')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma interação comercial')).toBeInTheDocument();
    expect(screen.getByText('Nenhum interesse marcado')).toBeInTheDocument();
    expect(screen.getByText('Sem empresa')).toBeInTheDocument();
  });

  it('nunca inventa nomes ou valores das imagens de referência', () => {
    renderTab();
    expect(screen.queryByText(/Joaquim|Ana Souza|12\.450|Score 92|Segmento Varejo/)).not.toBeInTheDocument();
  });

  it('"Ver no SalesView →" de Últimas compras troca para a aba SalesView', () => {
    const { onTabChange } = renderTab();
    fireEvent.click(screen.getByText('Ver no SalesView →'));
    expect(onTabChange).toHaveBeenCalledWith('orders');
  });

  it('"Ver na Journey →" troca para a aba Journey', () => {
    const { onTabChange } = renderTab();
    fireEvent.click(screen.getByText('Ver na Journey →'));
    expect(onTabChange).toHaveBeenCalledWith('history');
  });

  it('"Ver tarefas →" do card "Etapa no funil" navega para Tarefas', () => {
    renderTab();
    const card = screen.getByText('Etapa no funil').closest('section')!;
    fireEvent.click(within(card).getByText('Ver tarefas →'));
    expect(mockNavigateToView).toHaveBeenCalledWith('tasks');
  });

  it('"Abrir Tarefas" do estado vazio de negociação navega para Tarefas', () => {
    renderTab();
    const card = screen.getByText('Etapa no funil').closest('section')!;
    fireEvent.click(within(card).getByText('Abrir Tarefas'));
    expect(mockNavigateToView).toHaveBeenCalledWith('tasks');
  });

  it('"Ver tarefas →" do card "Pipeline comercial" navega para Tarefas', () => {
    renderTab();
    const card = screen.getByText('Pipeline comercial').closest('section')!;
    fireEvent.click(within(card).getByText('Ver tarefas →'));
    expect(mockNavigateToView).toHaveBeenCalledWith('tasks');
  });

  it('exibe o ticket médio formatado em BRL quando há compras concluídas', () => {
    renderTab({ ...EMPTY_CRM360, ticketMedio: 1234.5 });
    expect(screen.getByText(/R\$\s*1\.234,50/)).toBeInTheDocument();
  });

  it('renderiza o stepper de etapas quando há um deal aberto', () => {
    renderTab({
      ...EMPTY_CRM360,
      stages: [{ id: 's1', name: 'Prospecção', position: 1, is_active: true }, { id: 's2', name: 'Proposta', position: 2, is_active: true }],
      currentStage: { id: 's1', name: 'Prospecção', position: 1, is_active: true },
      currentDeal: { id: 'd1', title: 'Negócio X', value: 1000, status: 'open', stage_id: 's1', expected_close_date: null, updated_at: '2026-01-01T00:00:00.000Z' },
    });
    expect(screen.getByText('Prospecção')).toBeInTheDocument();
    expect(screen.getByText('Avançar etapa →')).toBeInTheDocument();
  });

  /**
   * A4-D (2º chamador): `conversation.contact` não traz endereço nem coordenada. Sem o dado
   * enriquecido o editor abria com endereço vazio e mapa sem pino — o ContactDetails já passava
   * `enrichedData`, o Crm360Tab não.
   */
  it('editar contato repassa endereço e coordenada do dado enriquecido ao editor', async () => {
    mockUseContactEnrichedQuery.mockReturnValue({
      data: {
        address: 'Av. Paulista', address_number: '1000', city: 'São Paulo', state: 'SP',
        postal_code: '01310100', neighborhood: 'Bela Vista', latitude: -23.5613, longitude: -46.6565,
      },
      isLoading: false,
    });
    renderTab();
    fireEvent.click(screen.getByText('Adicionar empresa'));

    const stub = await screen.findByTestId('edit-contact-stub');
    const contact = JSON.parse(stub.getAttribute('data-contact') ?? '{}');
    expect(mockUseContactEnrichedQuery).toHaveBeenCalledWith('contact-1');
    expect(contact).toMatchObject({
      id: 'contact-1',
      address: 'Av. Paulista',
      city: 'São Paulo',
      postal_code: '01310100',
      latitude: -23.5613,
      longitude: -46.6565,
    });
  });

  it('com cache frio, só monta o editor quando o dado enriquecido chega', async () => {
    mockUseContactEnrichedQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderTabWithRerender();
    fireEvent.click(screen.getByText('Adicionar empresa'));
    // Montar agora congelaria o form sem endereço.
    expect(screen.queryByTestId('edit-contact-stub')).toBeNull();

    mockUseContactEnrichedQuery.mockReturnValue({
      data: { address: 'Av. Paulista', city: 'São Paulo' },
      isLoading: false,
    });
    rerender();

    const stub = await screen.findByTestId('edit-contact-stub');
    expect(JSON.parse(stub.getAttribute('data-contact') ?? '{}')).toMatchObject({ address: 'Av. Paulista' });
  });

  /**
   * Refazer (TL a11y links CRM 360°): os três links de ação tinham área de toque de 16 px
   * (text-xs, sem altura) e usavam a primária de PREENCHIMENTO como cor de TEXTO
   * (`text-primary`), 3,4:1 sobre o card branco — reprovado como AA. Agora cada link
   * carrega `h-7` (1,75rem = 28 px ≥ 24 px) e o par de TEXTO `--primary-text`.
   */
  it('links de ação do CRM 360° têm área de toque ≥24px e usam o par de texto --primary-text', () => {
    h.nextActions.push({ label: 'Ligar de volta', description: 'Cliente pediu retorno' });
    renderTab();
    for (const label of ['Ver no SalesView →', 'Criar tarefa →', 'Ver na Journey →']) {
      const el = screen.getByText(label);
      // jsdom não tem layout: o contrato medido aqui é a classe; h-7 = 1,75rem = 28px.
      expect(el.className, label).toContain('h-7');
      expect(el.className, label).toContain('text-[hsl(var(--primary-text))]');
    }
  });

  it('o par de texto aplicado nos links fecha AA (≥4,5:1) sobre o card nos temas claro e escuro', () => {
    h.nextActions.push({ label: 'Ligar de volta', description: 'Cliente pediu retorno' });
    renderTab();
    for (const label of ['Ver no SalesView →', 'Criar tarefa →', 'Ver na Journey →']) {
      const token = tokenDeTexto(screen.getByText(label));
      for (const [tema, css] of [['claro', TOKENS_CSS], ['escuro', DARK_TOKENS]] as const) {
        const razao = razaoContraste(hslToRgb(tokenHsl(css, token)), hslToRgb(tokenHsl(css, 'card')));
        expect(razao, `${label} / ${tema} (--${token}): ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('axe não acusa color-contrast no CRM 360° nos temas claro e escuro', async () => {
    h.nextActions.push({ label: 'Ligar de volta', description: 'Cliente pediu retorno' });
    renderTab();
    // A regra color-contrast fica LIGADA; o jsdom a devolve como "incomplete" (sem layout),
    // então o alvo é zero violações — a razão real é provada pelo teste acima.
    for (const tema of ['claro', 'escuro'] as const) {
      document.documentElement.classList.toggle('dark', tema === 'escuro');
      const results = await axe(document.body);
      expect(results.violations.filter((v) => v.id === 'color-contrast'), tema).toEqual([]);
    }
    document.documentElement.classList.remove('dark');
  });
});
