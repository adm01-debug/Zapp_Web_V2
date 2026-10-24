import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import type { Mock } from 'vitest';
import { TalkXQueryBoundary } from '../states';

/**
 * X047 — matriz POR TELA e contrato de adoção dos estados.
 *
 * A matriz preserva a prova do boundary isolado e também prova a ADOÇÃO: para
 * cada tela exigida pela X047, o mesmo contrato tem de valer no lugar onde o
 * operador usa a tela de verdade —
 *   1. erro vence o vazio (consulta que falhou nunca vira "nada encontrado");
 *   2. "Tentar novamente" refaz a consulta daquela tela;
 *   3. carregando expõe `aria-busy` (quando aplicável);
 *   4. sem erro e vazio, aí sim o vazio aparece.
 *
 * E o contrato estático: pelo menos NOVE usos reais do `TalkXQueryBoundary` em
 * `src/components/talkx/*.tsx` (as nove telas) e nenhum resquício do placeholder
 * legado "Carregando campanha…".
 *
 * Este cartão NÃO corrige telas: se uma tela quebrar, o achado vai para o cartão
 * dela. Aqui, uma tela quebrada = matriz vermelha, que é o ponto.
 *
 * Mocks: este arquivo monta TODAS as telas, então mocka os módulos de dados uma
 * única vez e controla o estado por `H` (hoisted), em vez de remontar o módulo
 * por caso (evita duas cópias do React e "Invalid hook call").
 */

/* ------------------------------------------------------------------ */
/* Matriz do boundary isolado                                          */
/* ------------------------------------------------------------------ */

const query = (over: Partial<Parameters<typeof TalkXQueryBoundary>[0]['query']> = {}) => ({
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  ...over,
});

function renderBoundary(q: ReturnType<typeof query>, isEmpty = false) {
  return render(
    <TalkXQueryBoundary
      query={q}
      entity="campanhas"
      onRetry={vi.fn()}
      skeleton={<div>esqueleto</div>}
      isEmpty={isEmpty}
      empty={<div>vazio</div>}
    >
      <div>conteudo</div>
    </TalkXQueryBoundary>,
  );
}

describe('TalkXQueryBoundary (matriz de estados — X047)', () => {
  it('carregando: mostra o esqueleto e marca aria-busy', () => {
    const { container } = renderBoundary(query({ isLoading: true }));
    expect(screen.getByText('esqueleto')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
  });

  it('erro: mostra o erro e NUNCA o vazio (nem com a lista vazia)', () => {
    const err = new Error('Falha de rede: servidor X047 indisponivel');
    const { container } = renderBoundary(query({ isError: true, error: err }), true);
    // o defeito que a etapa corrige: vazio aparecendo no lugar do erro
    expect(screen.queryByText('vazio')).toBeNull();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    // e o erro e mostrado, com a entidade no titulo
    expect(screen.getByText(/campanhas/i)).toBeTruthy();
  });

  it('vazio sem erro: mostra o vazio', () => {
    const { container } = renderBoundary(query(), true);
    expect(screen.getByText('vazio')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
  });

  it('conteudo: mostra os filhos', () => {
    const { container } = renderBoundary(query());
    expect(screen.getByText('conteudo')).toBeTruthy();
    expect(screen.queryByText('vazio')).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeTruthy();
  });

  it('refetch em andamento: conteudo continua visivel, com aria-busy', () => {
    const { container } = renderBoundary(query({ isFetching: true }));
    expect(screen.getByText('conteudo')).toBeTruthy();
    const el = container.querySelector('[data-talkx-query="content"]') as HTMLElement;
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('precedencia: erro vence o carregamento? nao — carregando vence, e o erro aparece depois', () => {
    const { container } = renderBoundary(query({ isLoading: true, isError: true }));
    // durante a PRIMEIRA carga nao se anuncia erro: mostra esqueleto
    expect(screen.getByText('esqueleto')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="error"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Contrato estático                                                   */
/* ------------------------------------------------------------------ */

/** Diretório das telas do Talk X, independente de onde o vitest foi chamado. */
const TALKX_DIR = (() => {
  const porCwd = path.resolve(process.cwd(), 'src/components/talkx');
  if (existsSync(path.join(porCwd, 'TalkXView.tsx'))) return porCwd;
  const local = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  return local;
})();

/** As nove telas exigidas pela X047 (arquivo -> rótulo do critério). */
const TELAS_ADOTADAS: Array<[string, string]> = [
  ['TalkXOverview.tsx', 'Visão geral'],
  ['TalkXSegments.tsx', 'Segmentos'],
  ['TalkXTemplates.tsx', 'Templates'],
  ['TalkXSuppression.tsx', 'Supressão'],
  ['TalkXAnalytics.tsx', 'Analytics'],
  ['TalkXSettings.tsx', 'Configurações'],
  ['TalkXLiveMonitor.tsx', 'Monitor'],
  ['TalkXCampaignRunning.tsx', 'Em andamento'],
  ['TalkXCampaignScheduled.tsx', 'Agendada'],
];

const PLACEHOLDER_LEGADO = 'Carregando campanha…';

function fonte(arquivo: string): string {
  return readFileSync(`${TALKX_DIR}/${arquivo}`, 'utf8');
}

describe('contrato de adoção dos estados (X047) — estático', () => {
  it('pelo menos 9 usos reais de TalkXQueryBoundary nas telas, uma por tela exigida', () => {
    const arquivos = readdirSync(TALKX_DIR).filter((nome) => nome.endsWith('.tsx'));

    const porArquivo = new Map<string, number>();
    let total = 0;
    for (const nome of arquivos) {
      const usos = (fonte(nome).match(/<TalkXQueryBoundary\b/g) ?? []).length;
      if (usos > 0) {
        porArquivo.set(nome, usos);
        total += usos;
      }
    }

    expect(
      porArquivo.size,
      `telas adotando o boundary: ${[...porArquivo.keys()].join(', ')}`,
    ).toBeGreaterThanOrEqual(9);
    expect(total, 'usos reais (<TalkXQueryBoundary) no diretório').toBeGreaterThanOrEqual(9);

    for (const [arquivo, tela] of TELAS_ADOTADAS) {
      expect(porArquivo.get(arquivo) ?? 0, `tela sem adoção: ${tela} (${arquivo})`).toBeGreaterThan(0);
    }
  });

  it('não sobrou o placeholder legado "Carregando campanha…"', () => {
    const arquivos = readdirSync(TALKX_DIR).filter((nome) => nome.endsWith('.tsx'));
    const ocorrencias = arquivos.filter((nome) => fonte(nome).includes(PLACEHOLDER_LEGADO));

    expect(ocorrencias, `placeholder legado presente em: ${ocorrencias.join(', ')}`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Mocks controláveis por cena                                         */
/* ------------------------------------------------------------------ */

type EstadoCena = 'erro' | 'carregando' | 'vazio' | 'ok';
type Resposta = { data: unknown; error: unknown };

const H = vi.hoisted(() => ({
  estado: 'ok' as 'erro' | 'carregando' | 'vazio' | 'ok',
  // useTalkX
  campaigns: [] as Array<Record<string, unknown>>,
  campaignsLoading: false,
  campaignsFetching: false,
  campaignsError: null as Error | null,
  refetchCampaigns: vi.fn(),
  // useTalkXSegments
  segments: [] as Array<Record<string, unknown>>,
  segmentsLoading: false,
  segmentsError: null as Error | null,
  refetchSegments: vi.fn(),
  // useTalkXTemplates
  templates: [] as Array<Record<string, unknown>>,
  templatesLoading: false,
  templatesError: null as Error | null,
  refetchTemplates: vi.fn(),
  // useTalkXSettings
  settings: undefined as Record<string, unknown> | undefined,
  settingsLoading: false,
  settingsError: null as Error | null,
  refetchSettings: vi.fn(),
  // supabase (tabela -> resolvedor)
  tabelas: {} as Record<string, () => Promise<Resposta>>,
  chamadas: [] as string[],
  // hooks do Monitor
  eventsError: null as Error | null,
  refetchEvents: vi.fn(),
  rateError: null as Error | null,
  refetchRate: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    const resolver = (): Promise<Resposta> => {
      H.chamadas.push(tabela);
      const fn = H.tabelas[tabela];
      return fn ? fn() : Promise.resolve({ data: [], error: null });
    };
    c.select = () => c;
    c.eq = () => c;
    c.is = () => c;
    c.not = () => c;
    c.order = () => c;
    c.limit = () => resolver();
    c.single = () => resolver();
    c.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolver().then(ok, err);
    return c;
  };
  const canal = () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    return ch;
  };
  return {
    supabase: {
      from: (tabela: string) => cadeia(tabela),
      channel: canal,
      removeChannel: () => undefined,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.not = () => c;
    c.order = () => c;
    c.limit = () => Promise.resolve({ data: [], error: null });
    c.single = () => Promise.resolve({ data: null, error: null });
    return c;
  };
  return {
    fromTable: () => cadeia(),
    supabase: { from: () => cadeia(), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined, rpc: () => Promise.resolve({ data: null, error: null }) },
    invokeEdge: () => Promise.resolve({ data: null, error: null }),
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: H.campaigns,
    isLoading: H.campaignsLoading,
    isFetching: H.campaignsFetching,
    isError: H.campaignsError !== null,
    error: H.campaignsError,
    isLive: false,
    refetchCampaigns: H.refetchCampaigns,
    refetch: H.refetchCampaigns,
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...real,
    useTalkXSegments: () => ({
      segments: H.segments,
      isLoading: H.segmentsLoading,
      isFetching: false,
      isError: H.segmentsError !== null,
      error: H.segmentsError,
      refetch: H.refetchSegments,
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/integrations/useTalkXTemplates')>();
  return {
    ...real,
    useTalkXTemplates: () => ({
      templates: H.templates,
      isLoading: H.templatesLoading,
      isFetching: false,
      isError: H.templatesError !== null,
      error: H.templatesError,
      refetch: H.refetchTemplates,
      createTemplate: { mutate: vi.fn() },
      updateTemplate: { mutate: vi.fn() },
      deleteTemplate: { mutate: vi.fn() },
      duplicateTemplate: { mutate: vi.fn() },
      testTemplate: vi.fn(),
      fetchVersionHistory: vi.fn(),
      fetchVariants: vi.fn(),
      saveVariant: vi.fn(),
      deleteVariant: vi.fn(),
      countVariantRecipients: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXSettings', () => ({
  useTalkXSettings: () => ({ data: H.settings, isLoading: H.settingsLoading, error: H.settingsError, refetch: H.refetchSettings }),
  useTalkXSettingUpdate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: H.eventsError !== null, error: H.eventsError, refetch: H.refetchEvents, logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({ rateByMinute: [], isLoading: false, isError: H.rateError !== null, error: H.rateError, refetch: H.refetchRate }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-matriz', full_name: 'Matriz X047' }, user: { id: 'user-matriz' }, session: null, loading: false }),
}));

vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AreaChart: Box, Area: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: Box,
    BarChart: Box, Bar: () => null, Cell: () => null, Legend: () => null,
  };
});

vi.mock('@/components/dashboard/overview/DashboardKpiCard', () => ({
  DashboardKpiCard: () => <div data-testid="kpi" />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

/* ------------------------------------------------------------------ */
/* Componentes sob teste                                               */
/* ------------------------------------------------------------------ */

import { TalkXOverview } from '../../TalkXOverview';
import { TalkXSegments } from '../../TalkXSegments';
import { TalkXTemplates } from '../../TalkXTemplates';
import { TalkXSuppression } from '../../TalkXSuppression';
import { TalkXAnalytics } from '../../TalkXAnalytics';
import { TalkXSettings } from '../../TalkXSettings';
import { TalkXLiveMonitor } from '../../TalkXLiveMonitor';
import { TalkXCampaignRunning } from '../../TalkXCampaignRunning';
import { TalkXCampaignScheduled } from '../../TalkXCampaignScheduled';
import TalkXView from '../../TalkXView';

const ERRO = /Não foi possível carregar/;

type Caso = 'erro' | 'retry' | 'carregando' | 'vazio';

interface Linha {
  tela: string;
  arquivo: string;
  casos: Caso[];
  preparar: (estado: EstadoCena) => void;
  montar: () => ReactElement;
  /** vazio específico da tela (prova que ele NÃO aparece sob erro) */
  vazioTexto?: RegExp;
  /** refetch por espião (hook/prop) — o retry tem de chamá-lo */
  retrySpy?: Mock;
  /** refetch por nova chamada ao Supabase nesta tabela */
  retryTabela?: string;
}

function erroGenerico(texto: string): () => Promise<Resposta> {
  return () => Promise.resolve({ data: null, error: new Error(texto) });
}
function pendente(): () => Promise<Resposta> {
  return () => new Promise<Resposta>(() => undefined);
}
function vazio(): () => Promise<Resposta> {
  return () => Promise.resolve({ data: [], error: null });
}
/** Consulta que devolve um único registro: vazio = `null`, não `[]`. */
function vazioNulo(): () => Promise<Resposta> {
  return () => Promise.resolve({ data: null, error: null });
}

const LINHAS: Linha[] = [
  {
    tela: 'Visão geral',
    arquivo: 'TalkXOverview.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: () => undefined,
    montar: () => {
      // A Visão geral recebe o estado da consulta do contêiner (TalkXView),
      // em vez de lê-lo diretamente de um hook.
      const props = {
        campaigns: [],
        segments: [],
        creators: {},
        isLoading: H.estado === 'carregando',
        isError: H.estado === 'erro',
        error: H.estado === 'erro' ? new Error('falha exclusiva X047 — Visão geral') : null,
        onRetry: H.refetchCampaigns,
        onNew: vi.fn(),
        onEdit: vi.fn(),
        onView: vi.fn(),
        onViewScheduled: vi.fn(),
        onViewRunning: vi.fn(),
        onDuplicate: vi.fn(),
        onStart: vi.fn(),
        onPause: vi.fn(),
        onCancel: vi.fn(),
        onDelete: vi.fn(),
        onGoTab: vi.fn(),
      };
      return <TalkXOverview {...props} />;
    },
    vazioTexto: /Nenhuma campanha encontrada/,
    retrySpy: H.refetchCampaigns,
  },
  {
    tela: 'Segmentos',
    arquivo: 'TalkXSegments.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.segmentsError = new Error('falha exclusiva X047 — Segmentos');
      if (estado === 'carregando') H.segmentsLoading = true;
    },
    montar: () => <TalkXSegments onUseCampaign={vi.fn()} />,
    vazioTexto: /Nenhum segmento salvo/,
    retrySpy: H.refetchSegments,
  },
  {
    tela: 'Templates',
    arquivo: 'TalkXTemplates.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.templatesError = new Error('falha exclusiva X047 — Templates');
      if (estado === 'carregando') H.templatesLoading = true;
    },
    montar: () => <TalkXTemplates onUseTemplate={vi.fn()} />,
    vazioTexto: /Nenhum template criado/,
    retrySpy: H.refetchTemplates,
  },
  {
    tela: 'Supressão',
    arquivo: 'TalkXSuppression.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.tabelas.talkx_blacklist = erroGenerico('falha exclusiva X047 — Supressão');
      if (estado === 'carregando') H.tabelas.talkx_blacklist = pendente();
      if (estado === 'vazio') H.tabelas.talkx_blacklist = vazio();
    },
    montar: () => <TalkXSuppression />,
    vazioTexto: /Nenhum contato na lista de supressão/,
    retryTabela: 'talkx_blacklist',
  },
  {
    tela: 'Analytics',
    arquivo: 'TalkXAnalytics.tsx',
    casos: ['erro', 'carregando', 'vazio'],
    preparar: () => undefined,
    montar: () => (
      <TalkXAnalytics campaigns={[]} isLoading={H.estado === 'carregando'} isError={H.estado === 'erro'} />
    ),
    vazioTexto: /Nenhuma campanha para analisar/,
  },
  {
    tela: 'Configurações',
    arquivo: 'TalkXSettings.tsx',
    casos: ['erro', 'retry', 'carregando'],
    preparar: (estado) => {
      if (estado === 'erro') H.settingsError = new Error('falha exclusiva X047 — Configurações');
      if (estado === 'carregando') H.settingsLoading = true;
    },
    montar: () => <TalkXSettings />,
    retrySpy: H.refetchSettings,
  },
  {
    tela: 'Monitor',
    arquivo: 'TalkXLiveMonitor.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.tabelas.talkx_campaigns = erroGenerico('falha exclusiva X047 — Monitor');
      if (estado === 'carregando') H.tabelas.talkx_campaigns = pendente();
      if (estado === 'vazio') H.tabelas.talkx_campaigns = vazioNulo();
    },
    montar: () => <TalkXLiveMonitor campaignId="camp-matriz" onBack={vi.fn()} />,
    vazioTexto: /Campanha não encontrada/,
    retryTabela: 'talkx_campaigns',
  },
  {
    tela: 'Em andamento',
    arquivo: 'TalkXCampaignRunning.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.campaignsError = new Error('falha exclusiva X047 — Em andamento');
      if (estado === 'carregando') H.campaignsLoading = true;
    },
    montar: () => <TalkXCampaignRunning onBack={vi.fn()} onViewMonitor={vi.fn()} initialCampaignId="camp-matriz" />,
    vazioTexto: /Nenhuma campanha em andamento no momento\./,
    retrySpy: H.refetchCampaigns,
  },
  {
    tela: 'Agendada',
    arquivo: 'TalkXCampaignScheduled.tsx',
    casos: ['erro', 'retry', 'carregando', 'vazio'],
    preparar: (estado) => {
      if (estado === 'erro') H.campaignsError = new Error('falha exclusiva X047 — Agendada');
      if (estado === 'carregando') H.campaignsLoading = true;
    },
    montar: () => (
      <TalkXCampaignScheduled campaignId="camp-matriz" onBack={vi.fn()} onEdit={vi.fn()} onStatusChange={vi.fn()} />
    ),
    vazioTexto: /Campanha agendada não encontrada/,
    retrySpy: H.refetchCampaigns,
  },
  {
    tela: 'Carregamento do wizard',
    arquivo: 'TalkXView.tsx',
    casos: ['carregando'],
    preparar: () => {
      H.campaignsLoading = true;
    },
    montar: () => <TalkXView />,
  },
];

function limpar() {
  H.estado = 'ok';
  H.campaigns = [];
  H.campaignsLoading = false;
  H.campaignsFetching = false;
  H.campaignsError = null;
  H.segments = [];
  H.segmentsLoading = false;
  H.segmentsError = null;
  H.templates = [];
  H.templatesLoading = false;
  H.templatesError = null;
  H.settings = undefined;
  H.settingsLoading = false;
  H.settingsError = null;
  H.tabelas = {};
  H.chamadas = [];
  H.eventsError = null;
  H.rateError = null;
  H.refetchCampaigns.mockClear();
  H.refetchSegments.mockClear();
  H.refetchTemplates.mockClear();
  H.refetchSettings.mockClear();
  H.refetchEvents.mockClear();
  H.refetchRate.mockClear();
}

function montar(linha: Linha) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{linha.montar()}</QueryClientProvider>);
}

function chamadasDe(tabela: string): number {
  return H.chamadas.filter((t) => t === tabela).length;
}

for (const linha of LINHAS) {
  describe(`matriz por tela — ${linha.tela} (${linha.arquivo})`, () => {
    beforeEach(() => {
      limpar();
      if (linha.tela === 'Carregamento do wizard') {
        window.history.replaceState(null, '', '/?view=talkx&wizard=draft-matriz&step=2');
      } else {
        window.history.replaceState(null, '', '/?view=talkx&tab=overview');
      }
      sessionStorage.clear();
    });

    if (linha.casos.includes('erro')) {
      it('consulta com erro: mostra o erro e NUNCA o vazio', async () => {
        H.estado = 'erro';
        linha.preparar('erro');
        const { container } = montar(linha);

        await waitFor(() => expect(screen.getByText(ERRO)).toBeTruthy());
        expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
        expect(container.querySelector('[data-talkx-query="loading"]')).toBeNull();
        if (linha.vazioTexto) expect(screen.queryByText(linha.vazioTexto)).toBeNull();
      });
    }

    if (linha.casos.includes('carregando')) {
      it('carregando: expõe aria-busy e não anuncia erro', async () => {
        H.estado = 'carregando';
        linha.preparar('carregando');
        const { container } = montar(linha);

        await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeTruthy());
        expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
        expect(screen.queryByText(ERRO)).toBeNull();
      });
    }

    if (linha.casos.includes('retry') && (linha.retrySpy || linha.retryTabela)) {
      it('"Tentar novamente" refaz a consulta da tela', async () => {
        H.estado = 'erro';
        linha.preparar('erro');
        montar(linha);

        await waitFor(() => expect(screen.getByText(ERRO)).toBeTruthy());

        const antes = linha.retryTabela ? chamadasDe(linha.retryTabela) : 0;
        const antesSpy = linha.retrySpy ? linha.retrySpy.mock.calls.length : 0;
        fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

        if (linha.retrySpy) {
          await waitFor(() => expect(linha.retrySpy!.mock.calls.length).toBeGreaterThan(antesSpy));
        }
        if (linha.retryTabela) {
          await waitFor(() => expect(chamadasDe(linha.retryTabela!)).toBeGreaterThan(antes));
        }
      });
    }

    if (linha.casos.includes('vazio') && linha.vazioTexto) {
      it('sem erro e vazio de verdade: aí sim mostra o vazio', async () => {
        H.estado = 'vazio';
        linha.preparar('vazio');
        const { container } = montar(linha);

        await waitFor(() => expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy());
        expect(screen.getByText(linha.vazioTexto!)).toBeTruthy();
        expect(screen.queryByText(ERRO)).toBeNull();
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Carregamento do wizard: prova própria (não usa o boundary de tela)  */
/* ------------------------------------------------------------------ */

describe('carregamento do wizard (X047) — TalkXView', () => {
  beforeEach(() => {
    limpar();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft-matriz&step=2');
  });

  it('resolvendo a campanha roteada: esqueleto com aria-busy, sem o placeholder legado', async () => {
    H.campaignsLoading = true;
    const { container } = montar(LINHAS[LINHAS.length - 1]);

    await waitFor(() => expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy());
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain(PLACEHOLDER_LEGADO);
  });
});
