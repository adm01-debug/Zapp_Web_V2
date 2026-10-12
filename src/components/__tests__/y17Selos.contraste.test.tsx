/**
 * Y17-5 — contraste dos SELOS com fundo tonal + texto do mesmo token
 * (achado 04 da auditoria a11y de 07/10: `.bg-warning/8.text-warning` = 1,98:1,
 * `.bg-success/20` = 4,00-4,04:1, `.text-destructive` = 3,78:1).
 *
 * O defeito, em Catálogo, Filas, SLA e War Room: o selo pintava a TINTA do
 * estado com alfa (`bg-warning/10`, `bg-success/20`) e o TEXTO com o MESMO
 * token, que é de PREENCHIMENTO (`text-warning` L50 no claro, `text-primary`
 * L53) — abaixo dos 4,5:1 de texto normal (e do próprio 3:1 de texto grande).
 * A correção usa só tokens que já existem: os pares de TEXTO do sistema
 * (`--warning-text`, `--destructive-text`, `--primary-text`) e o verde, cujo
 * token de estado já é o par de texto (`--success` L27).
 *
 * ── Como este teste prova ─────────────────────────────────────────────────
 * O mesmo medidor do repo (`MessageBubble.contrasteStatus` / `DashboardCard`):
 * renderiza o componente REAL, lê as classes que o selo REALMENTE recebeu
 * (classe `text-*` sem token mapeado QUEBRA o teste, não passa em silêncio),
 * sobe o DOM compondo a superfície real (a linha `bg-muted/30` do SLA), resolve
 * os tokens de `tokens.css` + `accessibility.css` nos QUATRO temas e mede a
 * razão WCAG do par pintado. Nada de literal pinado: se a classe mudar, o
 * número muda com ela. O jsdom não carrega o CSS do app, então o que se prova é
 * o par que as classes aplicadas RESOLVEM — a mesma conta do axe no navegador
 * (e o valor bate: `.bg-success/20` do relatório = 4,00-4,04; aqui, 4,04).
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLAAgentTable } from '../queues/SLAAgentTable';
import { SLAMetricCards } from '../queues/SLAMetricCards';
import { WarRoomAlertRow } from '../dashboard/war-room/WarRoomAlertRow';
import { WarRoomQueueRow } from '../dashboard/war-room/WarRoomQueueRow';
import { SentimentAlertsDashboard } from '../dashboard/SentimentAlertsDashboard';
import { AdvancedFilterChips } from '../catalog/catalogShared';
import { CatalogRail } from '../catalog/CatalogRail';

// Y29 — o CatalogRail lê `profiles.can_download` por `useDownloadPermission`,
// que exige AuthProvider. Aqui só o selo do delta interessa, então a permissão
// entra como dublê (mesmo padrão do CatalogRail.test.tsx), sem rede nem sessão.
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

// A tela de Sentimento lê o período por hook e monta 4 abas de gráfico: aqui só
// interessam os KPIs do topo, então hook e abas entram como dublês.
vi.mock('../dashboard/useSentimentData', () => ({
  useSentimentData: () => ({
    alerts: [],
    analyses: [],
    loading: false,
    fetchData: () => {},
    dailyData: [],
    agentData: [],
    stats: {
      totalAlerts: 9,
      criticalAlerts: 4,
      emailsSent: 3,
      avgSentiment: 62,
      negativeRate: 41,
      negativeAnalyses: 5,
      totalAnalyses: 12,
      uniqueContacts: 7,
    },
  }),
  getSentimentColor: () => 'text-success',
  getSentimentBg: () => 'bg-success',
}));
vi.mock('../dashboard/SentimentTabContent', () => ({
  OverviewTab: () => null,
  AgentsTab: () => null,
  AlertsTab: () => null,
  DistributionTab: () => null,
}));
// CT-21: o clique em "Exportar catálogo" fala com a edge — dublado, como no
// `CatalogRail.test.tsx`, para o rail montar sem rede.
vi.mock('../catalog/catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogExport')>();
  return {
    ...actual,
    exportCatalogCsv: vi.fn(async () => ({ ok: true, rows: 0, filename: 'x.csv', downloaded: true })),
  };
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ─────
type RGB = [number, number, number];

function hslParaRgb(h: number, s: number, l: number): RGB {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
function luminancia([r, g, b]: RGB): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
function razao(a: RGB, b: RGB): number {
  const l1 = luminancia(a);
  const l2 = luminancia(b);
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}
function compor(fundo: RGB, topo: RGB, alfa: number): RGB {
  return [0, 1, 2].map((i) => Math.round(fundo[i] * (1 - alfa) + topo[i] * alfa)) as RGB;
}

/** Tokens de UM bloco por cabeçalho EXATO (`seletor {`) — `indexOf` simples
 *  deixaria `.high-contrast` casar com `.dark.high-contrast` (substring). */
function tokensDoBloco(css: string, cabecalho: string): Record<string, RGB> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, RGB> = {};
        for (const t of limpo
          .slice(abre + 1, j)
          .matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g)) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS = fs.readFileSync(path.resolve(__dirname, '../../styles/tokens.css'), 'utf8');
const A11Y = fs.readFileSync(path.resolve(__dirname, '../../styles/accessibility.css'), 'utf8');
const CLARO = tokensDoBloco(TOKENS, ':root');
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS, '.dark') };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y, '.high-contrast') };
const HC_ESCURO = {
  ...ESCURO,
  ...tokensDoBloco(A11Y, '.high-contrast'),
  ...tokensDoBloco(A11Y, '.dark.high-contrast'),
};
const TEMAS = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['alto contraste', HC_CLARO],
  ['alto contraste escuro', HC_ESCURO],
] as const;

const MIN_TEXTO = 4.5;
const TAMANHOS = new Set([
  '2xs', '3xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', 'kpi-value', 'page-title',
]);
/** Classes `text-*` que os componentes podem aplicar → nome real da variável. */
const TOKEN_DO_TEXTO: Record<string, string> = {
  foreground: 'foreground',
  'muted-foreground': 'muted-foreground',
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  info: 'info',
  destructive: 'destructive',
  'primary-text': 'primary-text',
  'warning-text': 'warning-text',
  'destructive-text': 'destructive-text',
};

function textoDe(el: Element): string {
  for (const bruta of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
    const partes = bruta.split(':');
    if (partes.slice(0, -1).includes('hover')) continue;
    const c = partes[partes.length - 1];
    const arbitravel = c.match(/^text-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/);
    if (arbitravel) return arbitravel[1];
    const nome = c.match(/^text-([a-z0-9-]+)$/);
    if (nome && !TAMANHOS.has(nome[1])) {
      const token = TOKEN_DO_TEXTO[nome[1]];
      if (!token) throw new Error(`texto sem token mapeado (a cor mudou sem o teste saber): ${c}`);
      return token;
    }
  }
  throw new Error(`elemento sem cor de texto resolvível: ${el.getAttribute('class')}`);
}

function tintaDe(el: Element | null): { token: string; alfa: number } | null {
  if (!el) return null;
  for (const bruta of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
    const partes = bruta.split(':');
    if (partes.slice(0, -1).includes('hover')) continue;
    const m = partes[partes.length - 1].match(/^bg-([a-z0-9-]+)(?:\/(\d+))?$/);
    if (m) return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
  }
  return null;
}

/** O elemento (ou o ancestral mais próximo) que declara a cor do texto do selo. */
function comCor(el: Element | null): Element {
  let p: Element | null = el;
  while (p) {
    try {
      textoDe(p);
      return p;
    } catch {
      p = p.parentElement;
    }
  }
  throw new Error('nenhum ancestral declara cor de texto');
}

/** Mede o par REAL (texto × tinta × superfície) do elemento nos quatro temas. */
function medirNosTemas(el: Element, rotulo: string): Record<string, number> {
  const texto = textoDe(el);
  const tinta = tintaDe(el);
  const out: Record<string, number> = {};
  for (const [nome, vars] of TEMAS) {
    if (vars[texto] === undefined) throw new Error(`${rotulo}: token "${texto}" não existe em ${nome}`);
    if (tinta && vars[tinta.token] === undefined) {
      throw new Error(`${rotulo}: token de fundo "${tinta.token}" não existe em ${nome}`);
    }
    const camadas: Array<{ token: string; alfa: number }> = [];
    let pai = el.parentElement;
    while (pai) {
      const t = tintaDe(pai);
      if (t && vars[t.token]) camadas.push(t);
      pai = pai.parentElement;
    }
    let fundo = vars.card;
    for (const camada of camadas.reverse()) fundo = compor(fundo, vars[camada.token], camada.alfa);
    if (tinta) fundo = compor(fundo, vars[tinta.token], tinta.alfa);
    out[nome] = Number(razao(vars[texto], fundo).toFixed(2));
  }
  return out;
}

/** Mede e exige o piso de TEXTO normal (4,5:1) nos quatro temas. */
function exigirAA(alvo: Element, rotulo: string): void {
  const el = comCor(alvo);
  for (const [tema, r] of Object.entries(medirNosTemas(el, rotulo))) {
    expect(r, `${rotulo} — ${tema}: ${textoDe(el)} sobre a tinta real do selo`).toBeGreaterThanOrEqual(MIN_TEXTO);
  }
}

// ─── Fixtures (dado sintético, escrito para este teste) ─────────────────────
const AGENTES = [
  { agentId: 'a1', agentName: 'Ana Lima', overallRate: 95, firstResponse: { rate: 95, onTime: 19, total: 20 } },
  { agentId: 'a2', agentName: 'Bruno Sá', overallRate: 80, firstResponse: { rate: 80, onTime: 16, total: 20 } },
  { agentId: 'a3', agentName: 'Caio Reis', overallRate: 40, firstResponse: { rate: 40, onTime: 8, total: 20 } },
];
const METRICAS_PROPS = {
  data: {
    overallRate: 80,
    totalConversations: 240,
    firstResponse: { rate: 50, onTime: 12, breached: 3 },
    resolution: { rate: 60, onTime: 6, breached: 4, total: 10 },
  },
  periodLabel: 'Últimos 30 dias',
  sparkOverall: [] as number[],
  sparkFR: [] as number[],
  sparkRes: [] as number[],
  sparkConversations: [] as number[],
};
const ALERTA = {
  id: 'al-1',
  type: 'critical' as const,
  title: 'Fila crítica',
  message: 'Tempo de espera acima da meta.',
  timestamp: new Date('2026-10-09T12:00:00Z'),
};
const ALERTA_AVISO = { ...ALERTA, id: 'al-2', type: 'warning' as const, title: 'Risco de estouro' };
const FILA = {
  id: 'q1',
  name: 'Comercial',
  color: '#3b82f6',
  waiting: 3,
  avgWaitTime: 5.4,
  slaBreaches: 0,
  slaWarnings: 2,
  inProgress: 1,
};
const FILTROS = { isBestseller: true, priceMin: '', priceMax: '', colors: ['Azul'], materials: [] };
const STATS = {
  total: 240,
  in_stock: 180,
  featured: 12,
  new_30d: 9,
  bestseller: 21,
  kits: 4,
  low_stock: 7,
  categories_root: 6,
  suppliers_active: 2,
  last_sync_at: '2026-10-09T09:00:00Z',
  last_update_at: '2026-10-09T09:00:00Z',
  // mês anterior 40 → mês atual 30 = -25% (o delta negativo do resumo do rail)
  by_month: [
    { month: '2026-08', count: 40 },
    { month: '2026-09', count: 30 },
  ],
};

describe('Y17-5 — Filas/SLA: selos de taxa fecham AA (4,5:1) nos quatro temas', () => {
  it('selo por agente no verde', () => {
    render(<SLAAgentTable agents={AGENTES} />);
    exigirAA(screen.getByText('95% SLA'), 'selo verde por agente');
  });

  it('selo por agente no âmbar', () => {
    render(<SLAAgentTable agents={AGENTES} />);
    exigirAA(screen.getByText('80% SLA'), 'selo âmbar por agente');
  });

  it('selo por agente no vermelho', () => {
    render(<SLAAgentTable agents={AGENTES} />);
    exigirAA(screen.getByText('40% SLA'), 'selo vermelho por agente');
  });

  it('número da taxa geral sobre a tinta do card', () => {
    render(<SLAMetricCards {...METRICAS_PROPS} />);
    exigirAA(screen.getByText('80.0%'), 'taxa geral em âmbar');
  });

  it('contador "atrasados"', () => {
    render(<SLAMetricCards {...METRICAS_PROPS} />);
    // O card de Resolução também tem um span "atrasados"; este prova o de 1ª resposta (3).
    exigirAA(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && /^3 atrasados$/.test(el.textContent ?? '')),
      'contador de atrasados',
    );
  });
});

describe('Y17-5 — War Room e Sentimento: selos de estado fecham AA (4,5:1)', () => {
  it('linha de alerta crítica', () => {
    render(<WarRoomAlertRow alert={ALERTA} onDismiss={() => {}} />);
    exigirAA(screen.getByText('Fila crítica'), 'alerta crítica');
  });

  it('linha de alerta de aviso', () => {
    render(<WarRoomAlertRow alert={ALERTA_AVISO} onDismiss={() => {}} />);
    exigirAA(screen.getByText('Risco de estouro'), 'alerta de aviso');
  });

  it('selo "em risco" da fila', () => {
    render(<WarRoomQueueRow queue={FILA} onClick={() => {}} />);
    exigirAA(screen.getByText('2 em risco'), 'selo em risco');
  });

  it('contador de críticos dos Alertas de Sentimento', () => {
    render(<SentimentAlertsDashboard />);
    exigirAA(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && /críticos$/.test(el.textContent ?? '')),
      'contador de críticos',
    );
  });
});

describe('Y17-5 — Catálogo: chip de filtro e delta do rail fecham AA (4,5:1)', () => {
  it('chip de filtro ativo', () => {
    render(<AdvancedFilterChips filters={FILTROS} onChange={() => {}} />);
    exigirAA(screen.getByText('Cor: Azul'), 'chip de filtro ativo');
  });

  it('chip "Mais pedidos"', () => {
    render(<AdvancedFilterChips filters={FILTROS} onChange={() => {}} />);
    exigirAA(screen.getByText('Mais pedidos'), 'chip mais pedidos');
  });

  it('delta negativo do resumo do rail', () => {
    render(<CatalogRail stats={STATS} loading={false} />);
    exigirAA(screen.getByText('-25%'), 'delta negativo do rail');
  });
});
