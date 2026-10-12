import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X047 — estados da Visão geral e carregamento de campanha do wizard.
 *
 * Regra da etapa: consulta que falhou mostra o ERRO (com retry), nunca o vazio;
 * enquanto a campanha roteada resolve, o wizard mostra esqueleto com aria-busy
 * em vez do texto solto que existia antes.
 *
 * Casos protegidos:
 * 1. `isError` com lista vazia → erro visível e NADA de vazio (o defeito que
 *    esta etapa corrige: a falha parecia "nenhuma campanha encontrada").
 * 2. "Tentar novamente" refaz a consulta sem resetar filtros nem rota.
 * 3. Carregando → esqueleto marcado com aria-busy.
 * 4. Sem erro e vazio → aí sim o vazio.
 * 5. `TalkXView` encaminha o erro/refetch da consulta de campanhas à Visão geral.
 * 6. Wizard resolvendo campanha roteada → esqueleto com aria-busy, sem o
 *    placeholder de carregamento legado (texto solto).
 */

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetchCampaigns: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isError: f.isError,
    error: f.error,
    isFetching: false,
    isLive: false,
    refetchCampaigns: f.refetchCampaigns,
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

// X077 — os KPIs vêm da RPC; estes testes não exercitam essa consulta.
vi.mock('@/hooks/integrations/useTalkXOverviewStats', () => ({
  useTalkXOverviewStats: () => ({ data: undefined }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
// X168 — o menu "Exportar relatório" do cabeçalho consulta permissão e papel.
vi.mock('@/hooks/system/useDownloadPermission', () => ({ useDownloadPermission: () => ({ canDownload: false, isLoading: false }) }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false }) }));
vi.mock('@/hooks/crm/useTeamProfiles',() => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({
  TalkXCampaignWizard: ({ campaign }: { campaign?: { id?: string } | null }) => (
    <section data-testid="wizard" data-campaign-id={campaign?.id ?? 'new'} />
  ),
}));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import { TalkXOverview } from '../TalkXOverview';
import TalkXView from '../TalkXView';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campaign = {
  id: 'c1', name: 'Campanha teste', status: 'sending', message_template: 'Oi {{nome}}',
  description: '', objective: 'engajamento', segment_id: null, audience_source: 'manual',
  created_by: 'u1', sent_count: 10, failed_count: 1, total_recipients: 20,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
  started_at: null, completed_at: null, scheduled_at: null, draft_step: null,
} as unknown as TalkXCampaign;

const baseProps = {
  campaigns: [] as TalkXCampaign[],
  segments: [],
  creators: {},
  isLoading: false,
  onNew: vi.fn(),
  onEdit: vi.fn(),
  onView: vi.fn(),
  onDuplicate: vi.fn(),
  onStart: vi.fn(),
  onPause: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onGoTab: vi.fn(),
};

describe('Visão geral — estados da consulta (X047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.campaigns = [];
    f.isLoading = false;
    f.isError = false;
    f.error = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('erro: mostra o erro e NUNCA o vazio', () => {
    const { container } = render(
      <TalkXOverview {...baseProps} campaigns={[]} isError error={new Error('falha de rede')} onRetry={vi.fn()} />,
    );
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(screen.queryByText('Nenhuma campanha encontrada')).toBeNull();
  });

  it('Tentar novamente refaz a consulta sem mexer na rota nem nos filtros', () => {
    sessionStorage.setItem(
      'talkx.overview.filters',
      JSON.stringify({ status: 'sending', objective: 'all', segment: 'all', creator: 'all' }),
    );
    const push = vi.spyOn(window.history, 'pushState');
    const onRetry = vi.fn();
    const { rerender } = render(
      <TalkXOverview {...baseProps} campaigns={[]} isError error={new Error('falha de rede')} onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?view=talkx&tab=overview');

    // Quando a consulta volta a responder, os filtros que o usuário tinha seguem aplicados.
    rerender(<TalkXOverview {...baseProps} campaigns={[campaign]} isError={false} onRetry={onRetry} />);
    expect(JSON.parse(sessionStorage.getItem('talkx.overview.filters') ?? '{}')).toMatchObject({ status: 'sending' });
    push.mockRestore();
  });

  it('carregando: mostra o esqueleto com aria-busy, não o erro', () => {
    const { container } = render(<TalkXOverview {...baseProps} campaigns={[]} isLoading isError={false} />);
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
  });

  it('vazio sem erro: aí sim mostra o vazio', () => {
    const { container } = render(<TalkXOverview {...baseProps} campaigns={[]} isError={false} />);
    expect(screen.getByText('Nenhuma campanha encontrada')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
  });
});

describe('TalkXView — erro da consulta chega à Visão geral (X047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.campaigns = [];
    f.isLoading = false;
    f.isError = false;
    f.error = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx');
  });

  it('encaminha isError/refetch: a Visão geral mostra o erro e o retry refaz a consulta', () => {
    f.isError = true;
    f.error = new Error('falha de rede');
    render(<TalkXView />);

    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(screen.queryByText('Nenhuma campanha encontrada')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(f.refetchCampaigns).toHaveBeenCalledTimes(1);
  });

  it('resolvendo campanha roteada: esqueleto com aria-busy, sem o placeholder legado', () => {
    f.isLoading = true;
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=2');
    const { container } = render(<TalkXView />);

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/Carregando\s+campanha/);
    expect(screen.queryByTestId('wizard')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TL-175A — acessibilidade da tela 01: nome acessível do seletor de tamanho de
// página e contraste local da pílula de rascunho.
// ════════════════════════════════════════════════════════════════════════════
/**
 * As duas medições do TL-175 na tela 01, cada uma provada contra o componente real:
 *
 * 1. `button-name` (axe, crítico, claro e escuro): o gatilho do Select de "N por
 *    página" (`kit/table.tsx`) é um `button role="combobox"` — nesse papel a
 *    AccName não tira nome do conteúdo, então o texto "8 por página" NÃO nomeava o
 *    controle (era o ÚNICO nó da tela acusado pela regra). Agora o gatilho tem
 *    rótulo explícito.
 * 2. `color-contrast` (axe, sério, no claro): a pílula "Retomar" do painel de
 *    rascunhos pintava o TEXTO com `--dash-amber` (âmbar de PREENCHIMENTO) sobre a
 *    própria tinta `bg-dash-amber/10` — 1,67:1. O teste lê o className REAL do
 *    botão, resolve os tokens no `src/styles/tokens.css` REAL e mede o par nos
 *    dois temas.
 *
 * jsdom não tem layout: a regra `color-contrast` do axe é inerte aqui, então a
 * segunda prova é a conta WCAG 2.1 sobre os tokens que o componente usa de fato.
 * A varredura do axe no Chromium real é do TL-175D.
 */
const TOKENS_CSS = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');

/** Tokens de um bloco (`:root` ou `.dark`) da folha aprovada, com chaves balanceadas. */
function tokensDoBloco(seletor: ':root {' | '.dark {'): Record<string, string> {
  const inicio = TOKENS_CSS.indexOf(seletor);
  if (inicio < 0) throw new Error(`bloco ${seletor} ausente em tokens.css`);
  const abre = TOKENS_CSS.indexOf('{', inicio);
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < TOKENS_CSS.length; i++) {
    if (TOKENS_CSS[i] === '{') nivel += 1;
    else if (TOKENS_CSS[i] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) throw new Error(`bloco ${seletor} sem fechamento em tokens.css`);
  const vars: Record<string, string> = {};
  for (const m of Array.from(TOKENS_CSS.slice(abre + 1, fim).matchAll(/--([\w-]+):\s*([^;]+);/g))) {
    vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return vars;
}

/** O tema claro é o `:root`; o `.dark` entra por cima, como na cascata do CSS. */
const TOKENS_CLARO = tokensDoBloco(':root {');
const TOKENS_ESCURO = { ...TOKENS_CLARO, ...tokensDoBloco('.dark {') };

/** De uma classe utilitária ('dash-amber' | '[hsl(var(--warning-text))]') para o token do CSS. */
function tokenDaClasse(util: string): string | null {
  const literal = util.match(/^\[hsl\(var\(--([\w-]+)\)\)\]$/);
  if (literal) return literal[1];
  return util in TOKENS_CLARO ? util : null;
}

function hslParaRgb(hsl: string): [number, number, number] {
  const [h, s, l] = hsl.split(/\s+/).slice(0, 3).map((p) => parseFloat(p));
  const c = (1 - Math.abs((2 * (l / 100)) - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  const seg = h / 60;
  const [r, g, b] = seg < 1 ? [c, x, 0] : seg < 2 ? [x, c, 0] : seg < 3 ? [0, c, x]
    : seg < 4 ? [0, x, c] : seg < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** A tinta translúcida sobre a superfície (o `bg-<token>/<alfa>` do Tailwind). */
function sobreTinta(frente: [number, number, number], fundo: [number, number, number], alfa: number): [number, number, number] {
  return [0, 1, 2].map((i) => frente[i] * alfa + fundo[i] * (1 - alfa)) as [number, number, number];
}

/** Contraste WCAG 2.1 entre duas cores: o que o botão PINTA e o que está ATRÁS dele. */
function contrasteDaPintura(className: string, tokens: Record<string, string>): number {
  // só as classes base: `hover:`/`focus:` não são o estado medido
  const base = className.split(/\s+/).filter((c) => c !== '' && !c.includes(':'));
  const textos = base.filter((c) => c.startsWith('text-')).map((c) => tokenDaClasse(c.slice(5))).filter(Boolean);
  const fundos = base.filter((c) => c.startsWith('bg-')).map((c) => c.slice(3));

  // a pintura tem de ser UMA cor de texto e UM fundo, senão a medição não vale
  expect(textos, `cor de texto do botão em "${className}"`).toHaveLength(1);
  expect(fundos, `fundo do botão em "${className}"`).toHaveLength(1);

  const [tokenFundo, alfa] = fundos[0].split('/');
  const texto = tokens[textos[0] as string];
  const tinta = tokens[tokenFundo];
  expect(texto, `token de texto ${textos[0]} em tokens.css`).toBeTruthy();
  expect(tinta, `token de fundo ${tokenFundo} em tokens.css`).toBeTruthy();

  const superficie = sobreTinta(hslParaRgb(tinta), hslParaRgb(tokens['card']), Number(alfa) / 100);
  const [claro, escuro] = [luminancia(hslParaRgb(texto)), luminancia(superficie)];
  return (Math.max(claro, escuro) + 0.05) / (Math.min(claro, escuro) + 0.05);
}

describe('Visão geral — acessibilidade da tela 01 (TL-175A)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  it('o seletor de "N por página" expõe nome acessível e a tela passa em button-name', async () => {
    const { container } = render(<TalkXOverview {...baseProps} campaigns={[campaign]} />);

    const seletor = screen.getByRole('combobox', { name: 'Itens por página' });
    expect(seletor.getAttribute('aria-label')).toBe('Itens por página');

    // o papel combobox não tira nome do conteúdo: sem o rótulo, o texto "8 por página" não conta
    const resultado = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });

  it('a pílula "Retomar" fecha contraste AA nos dois temas usando só tokens do sistema', () => {
    const rascunho = { ...campaign, id: 'c-draft', name: 'Campanha rascunho', status: 'draft' } as unknown as TalkXCampaign;
    render(<TalkXOverview {...baseProps} campaigns={[rascunho]} />);

    const pilula = screen.getByRole('button', { name: 'Retomar' });
    expect(pilula.className).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);

    const claro = contrasteDaPintura(pilula.className, TOKENS_CLARO);
    const escuro = contrasteDaPintura(pilula.className, TOKENS_ESCURO);
    expect(claro, `contraste da pílula no tema claro: ${claro.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(escuro, `contraste da pílula no tema escuro: ${escuro.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
