import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';

/**
 * TX-A11Y-2 (origem t_aeb3074d / TL-175D) — contraste do TEXTO da família primária
 * nas telas do Talk X.
 *
 * O caminho da prova é fechado, e é sempre o mesmo:
 *   componente REAL renderizado → classe de cor que o DOM recebeu →
 *   token resolvido no `tokens.css` de verdade (lido do disco) → razão WCAG ≥ 4,5:1
 *   nos dois temas.
 * Nada aqui é cópia do CSS nem string solta: se o componente voltar a aplicar o token
 * de preenchimento (`--primary-glow`/`--primary`) ou inventar um token que a folha não
 * define, o teste cai.
 *
 * jsdom não pinta pixel: a cor final é provada por (a) o medidor acima e (b) a
 * varredura axe-core no Chromium real (relato do cartão). O que jsdom prova — e é o que
 * interessa — é QUAL token cada elemento recebeu e que ele fecha AA sobre a superfície
 * em que aparece.
 */

// ─── Mocks (mesmo harness dos testes vizinhos do módulo) ────────────────────
const h = vi.hoisted(() => ({
  segments: [] as Array<Record<string, unknown>>,
  templates: [] as Array<Record<string, unknown>>,
  campaigns: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: h.segments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXTemplates')>();
  return {
    ...actual,
    useTalkXTemplates: () => ({
      templates: h.templates,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createTemplate: { mutateAsync: vi.fn() },
      updateTemplate: { mutateAsync: vi.fn() },
      deleteTemplate: { mutate: vi.fn() },
      duplicateTemplate: { mutate: vi.fn() },
      createVariant: { mutateAsync: vi.fn() },
      updateVariant: { mutateAsync: vi.fn() },
      deleteVariant: { mutate: vi.fn() },
      loadVariants: vi.fn().mockResolvedValue([]),
      saveActiveVariant: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    isLive: false,
    refetchCampaigns: vi.fn(),
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync: vi.fn() },
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', full_name: 'QA' }, user: { id: 'u1' }, session: null, loading: false }),
}));

vi.mock('@/components/dashboard/overview/DashboardKpiCard', () => ({
  DashboardKpiCard: () => <div data-testid="kpi-card" />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    AreaChart: Box,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Box,
  };
});

const { chain, supabaseMock } = vi.hoisted(() => {
  const chain = (): Record<string, unknown> => ({
    select: () => chain(),
    eq: () => chain(),
    neq: () => chain(),
    order: () => chain(),
    not: () => chain(),
    limit: () => chain(),
    in: () => chain(),
    ilike: () => chain(),
    or: () => chain(),
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
  });
  const realtime = () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  };
  return {
    chain,
    supabaseMock: {
      from: () => chain(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: realtime,
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => chain(),
  supabase: supabaseMock,
  invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

import { TalkXSegments } from '../TalkXSegments';
import { TalkXTemplates } from '../TalkXTemplates';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { TalkXSuppression } from '../TalkXSuppression';
import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';
import { TalkXCampaignRunning } from '../TalkXCampaignRunning';

// ─── Medidor WCAG ───────────────────────────────────────────────────────────
type RGB = [number, number, number];
function parseHsl(s: string): RGB {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(huel: number, s: number, l: number): RGB {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((huel / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (huel < 60) [r, g, b] = [c, x, 0];
  else if (huel < 120) [r, g, b] = [x, c, 0];
  else if (huel < 180) [r, g, b] = [0, c, x];
  else if (huel < 240) [r, g, b] = [0, x, c];
  else if (huel < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function luminancia([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
const compor = (cor: string, alfa: number, base: string): RGB => {
  const [r, g, b] = hslToRgb(...parseHsl(cor));
  const [br, bg, bb] = hslToRgb(...parseHsl(base));
  return [r * alfa + br * (1 - alfa), g * alfa + bg * (1 - alfa), b * alfa + bb * (1 - alfa)];
};
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const razao = (cor: string, base: string): number => razaoRgb(compor(cor, 1, base), compor(base, 1, base));
const razaoNaTinta = (texto: string, tinta: string, alfa: number, base: string) =>
  razaoRgb(compor(texto, 1, base), compor(tinta, alfa, base));

/** Variáveis de um bloco (`:root {` / `.dark {`). */
function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1;
  let i = abre + 1;
  while (profundidade > 0 && i < css.length) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}') profundidade--;
    i++;
  }
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css.slice(abre + 1, i - 1)))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

const tokens = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const claro = variaveis(tokens, ':root {');
const escuro = { ...claro, ...variaveis(tokens, '.dark {') };
const TEMAS = [['claro', claro], ['escuro', escuro]] as const;

const AA = 'text-[hsl(var(--primary-text))]';
const ANTIGA_TEXTUAL = 'text-primary-glow';
const MIN_TEXTO = 4.5;

const inner = (el: HTMLElement) => el.innerHTML;

/** O token que a CLASSE APLICADA aponta, lido do DOM: a forma `text-[hsl(var(--x))]`
 *  e a utility nomeada (`text-muted-foreground`), que o tailwind.config liga ao mesmo
 *  `--muted-foreground`. Tamanho de fonte não é cor e fica de fora. */
const CLASSE_TOKEN = /^text-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/;
const UTILITY_TOKEN = /^text-([a-z]+(?:-[a-z]+)*)$/;
const NAO_E_COR = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  'left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance', 'pretty',
  'ellipsis', 'clip', 'transparent', 'current', 'inherit', 'white', 'black',
]);
function tokenDe(el: Element): string | null {
  const classes = Array.from(el.classList);
  for (const c of classes) {
    const m = c.match(CLASSE_TOKEN);
    if (m) return m[1];
  }
  for (const c of classes) {
    const m = c.match(UTILITY_TOKEN);
    if (m && !NAO_E_COR.has(m[1])) return m[1];
  }
  return null;
}

/**
 * Fecha o laço: pega o token da classe que o componente REALMENTE aplicou, confere que o
 * `tokens.css` define esse token e mede a razão sobre a superfície onde o elemento vive.
 */
function medirTokenAplicado(el: Element, superficie: 'card' | 'tinta-primary-10', esperado: string) {
  const token = tokenDe(el);
  expect(token, `classe de texto aplicada em <${el.tagName.toLowerCase()} ${el.className}>`).toBe(esperado);
  for (const [nome, vars] of TEMAS) {
    expect(vars[token!], `${nome}: --${token} precisa existir no tokens.css`).toBeTruthy();
    const r = superficie === 'card'
      ? razao(vars[token!], vars.card)
      : razaoNaTinta(vars[token!], vars.primary, 0.1, vars.card);
    expect(r, `${nome}: --${token} sobre ${superficie} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXTO);
  }
}

function comQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

// ─── 1. O medidor no tokens.css real: o par de TEXTO fecha, o de preenchimento não serve ──
describe('TX-A11Y-2 — o par de texto da primária fecha 4,5:1 nos dois temas (tokens.css real)', () => {
  for (const [nome, vars] of TEMAS) {
    it(`${nome}: --primary-text ≥ 4,5:1 sobre o card E sobre a própria tinta /10`, () => {
      const texto = vars['primary-text'];
      expect(texto, `${nome}: --primary-text precisa existir`).toBeTruthy();
      expect(razao(texto, vars.card), `${nome}: --primary-text sobre --card`).toBeGreaterThanOrEqual(MIN_TEXTO);
      expect(
        razaoNaTinta(texto, vars.primary, 0.1, vars.card),
        `${nome}: --primary-text sobre --primary/10`,
      ).toBeGreaterThanOrEqual(MIN_TEXTO);
    });

    it(`${nome}: o calendário (--muted-foreground sem opacidade) fecha 4,5:1`, () => {
      // Os dias de fora ficam em `text-muted-foreground`: é este o par que o calendário do
      // Agendada passou a usar quando o `opacity-50` saiu. Com a opacidade o texto compunha
      // com o fundo e caía a 3,3:1 (escuro) e 2,14:1 (claro) — medido no axe.
      expect(razao(vars['muted-foreground'], vars.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
    });

    it(`${nome}: --primary-glow e --primary NÃO servem como texto (é o defeito que o cartão corrige)`, () => {
      expect(razao(vars['primary-glow'], vars.card)).toBeLessThan(MIN_TEXTO);
      if (nome === 'escuro') expect(razao(vars.primary, vars.card)).toBeLessThan(MIN_TEXTO);
    });
  }
});

// ─── 2. O token que cada componente aplica no DOM, medido no tokens.css real ──
describe('TX-A11Y-2 — os componentes do Talk X aplicam o par AA, e ele fecha AA onde o texto vive', () => {
  it('Segmentos: construtor de segmento (tela 03) sai do --primary-glow', () => {
    const { container } = comQuery(<TalkXSegments onUseCampaign={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo segmento/i }));
    expect(inner(container)).toContain(AA);
    expect(inner(container)).not.toContain(ANTIGA_TEXTUAL);
    medirTokenAplicado(screen.getByRole('button', { name: /Adicionar condição/i }), 'card', 'primary-text');
    medirTokenAplicado(screen.getByRole('button', { name: /Adicionar grupo \(AND\)/i }), 'card', 'primary-text');
  });

  it('Templates: biblioteca (tela 04) usa o par AA nas tags e no "Mais usados"', () => {
    h.templates = [
      {
        id: 'tpl-1', name: 'Boas-vindas', category: 'boas-vindas', status: 'approved',
        use_count: 7, tags: ['vip', 'onboarding'], content: 'Oi {{nome}}',
        created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
      },
    ];
    const { container } = render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    expect(inner(container)).toContain(AA);
    expect(inner(container)).not.toContain(ANTIGA_TEXTUAL);
    const tag = screen.getByText('#vip');
    medirTokenAplicado(tag, 'tinta-primary-10', 'primary-text');
    medirTokenAplicado(tag, 'card', 'primary-text');
  });

  it('Editor de template (tela 05): chips de variável e {{var}} no par AA', () => {
    h.templates = [];
    const { container } = render(
      <TalkXTemplateEditor templates={[]} isLoading={false} editing={null} onClose={vi.fn()} />,
    );
    expect(inner(container)).toContain(AA);
    expect(inner(container)).not.toContain(ANTIGA_TEXTUAL);
    medirTokenAplicado(screen.getByRole('button', { name: '{{nome}}' }), 'tinta-primary-10', 'primary-text');
    medirTokenAplicado(screen.getByText('{{var}}'), 'card', 'primary-text');
  });

  it('Editor de template: "Salvar template" inválido é um controle DESABILITADO de verdade', () => {
    // Nome e mensagem vazios: o botão nasce inativo — pelo atributo nativo, não por
    // opacidade sobre um botão vivo (era o defeito: 2,13:1 no claro e 3,01:1 no escuro).
    render(<TalkXTemplateEditor templates={[]} isLoading={false} editing={null} onClose={vi.fn()} />);
    const salvar = screen.getByRole('button', { name: /Salvar template/i });
    expect(salvar).toBeDisabled();
    expect(salvar.classList.contains('opacity-50')).toBe(false);
    expect(salvar.classList.contains('pointer-events-none')).toBe(false);
    expect(salvar.className).toContain('disabled:opacity-50');

    // Formulário válido: o mesmo botão fica acionável (o inativo é estado, não estilo).
    cleanup();
    render(
      <TalkXTemplateEditor
        templates={[]}
        isLoading={false}
        editing={{
          id: 'tpl-1', name: 'Boas-vindas', category: 'boas-vindas', status: 'approved',
          use_count: 0, tags: [], content: 'Oi {{nome}}', created_at: '', updated_at: '',
        } as never}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Salvar template/i })).toBeEnabled();
  });

  it('Lista de supressão (tela 06): "Saiba mais" no par AA e com diferença que não é só cor', () => {
    comQuery(<TalkXSuppression />);
    const link = screen.getByRole('link', { name: /Saiba mais/i });
    expect(link.classList.contains(AA)).toBe(true);
    expect(link.classList.contains(ANTIGA_TEXTUAL)).toBe(false);
    // `link-in-text-block` [serious]: o link dentro do bloco de texto precisa de um
    // sinal que não seja cor — o sublinhado permanente, não só no hover.
    expect(link.classList.contains('underline')).toBe(true);
    medirTokenAplicado(link, 'card', 'primary-text');
  });

  it('Campanha agendada (tela 10): calendário sem `opacity-50` nos dias de fora', () => {
    h.campaigns = [
      {
        id: 'camp-ag-1', name: 'Black Friday', message_template: 'Olá {{nome}}',
        status: 'scheduled', total_recipients: 1200, sent_count: 0, failed_count: 0,
        delivered_count: 0, scheduled_at: '2026-12-01T15:00:00.000Z',
        created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
      },
    ];
    const { container } = render(
      <TalkXCampaignScheduled campaignId="camp-ag-1" onBack={vi.fn()} onEdit={vi.fn()} />,
    );
    const fora = Array.from(container.querySelectorAll('.day-outside'));
    expect(fora.length).toBeGreaterThan(0);
    for (const dia of fora) {
      expect(dia.classList.contains('opacity-50'), 'dia de fora não pode ser translúcido').toBe(false);
      // O dia de fora é texto secundário — e o par fecha AA sem opacidade por cima.
      medirTokenAplicado(dia, 'card', 'muted-foreground');
    }
    expect(inner(container)).toContain(AA);
    expect(inner(container)).not.toContain(ANTIGA_TEXTUAL);
  });

  it('Campanha em andamento (tela 12): a aba ativa usa o par AA (não o preenchimento)', () => {
    h.campaigns = [
      {
        id: 'c1', name: 'Lançamento', message_template: 'Olá {{nome}}', status: 'sending',
        total_recipients: 10, sent_count: 5, failed_count: 0, delivered_count: 5,
        read_count: 1, replied_count: 0, outcome_unknown_count: 0,
        started_at: '2026-10-05T12:00:00.000Z', completed_at: null,
        created_at: '2026-10-05T10:00:00.000Z', updated_at: '2026-10-05T12:00:00.000Z',
      },
    ];
    comQuery(<TalkXCampaignRunning onBack={vi.fn()} onViewMonitor={vi.fn()} />);
    const abaAtiva = screen.getByRole('button', { name: 'Visão Geral' });
    expect(abaAtiva.classList.contains('border-primary')).toBe(true);
    medirTokenAplicado(abaAtiva, 'card', 'primary-text');
  });
});
