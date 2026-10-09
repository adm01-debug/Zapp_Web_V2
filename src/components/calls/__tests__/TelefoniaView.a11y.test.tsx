/**
 * T76/T80 (Fase 8) + T84 (Fase 9) — acessibilidade automatizada do MODULO de
 * Telefonia, com o componente REAL montado (`TelefoniaView`), nao um duble.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────
 * O aceite da Fase 8 (`docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`,
 * T76) e "axe `serious/critical` = 0" e o da Fase 9 (T84) pede a varredura em
 * "tela ociosa + painel ativo". O plano fecha as duas fases sem nenhum arquivo
 * que RODE esse axe dentro da suite — as provas de T81/T84 moravam em script
 * fora do repo (`/workspace/qa/tel/axe.mjs`), que nao deixa rede de seguranca.
 * Este teste traz a prova para dentro da suite: mesmo padrao do `CT67_a11y`
 * (catalogo), ja aceito no repo.
 *
 * ── O que e medido ─────────────────────────────────────────────────────────
 * Tres estados reais da tela, cada um com uma razao de existir:
 *   1. OCIOSA (historico vazio): header + KPIs + toolbar + estado vazio + painel
 *      de nova ligacao (teclado, seletor de canal, CTA).
 *   2. CHAMADA ATIVA: o slot lateral vira `ActiveCallPanel` (mute/teclado/
 *      encerrar) e o historico mostra linhas (`CallHistoryTable`).
 *   3. DETALHE SELECIONADO: `SelectedCallPanel` (anotacao + registro somente
 *      leitura do provedor).
 * Em cada um: `0` violacoes `critical`/`serious` (o aceite) E o inventario de
 * violacoes NAO-sérias e AFIRMADO por igualdade — nada fica escondido: uma
 * moderada nova quebra o teste e o inventario precisa ser atualizado a mao.
 *
 * ── Controle vermelho-antes ────────────────────────────────────────────────
 * O ultimo `describe` prova que o matcher NAO e decorativo: um `<button>` sem
 * nome acessivel contem `button-name` (impacto `critical`) e o matcher reprova.
 * Sem isso, "0 violacoes" poderia estar medindo um axe que nunca rodou.
 *
 * ── Mocks (fronteira, nunca o sujeito) ─────────────────────────────────────
 * `useAuth`/`useUserRole` (identidade), `useCallSession` (a sessao SIP, cujo
 * estado decide qual painel aparece), `useCalls` (RPC de anotacao),
 * `useCallsKpi`/`useMyCalls`/`useCallChannels` (RPCs do historico/capacidades),
 * `tabLeaderStore` (WebSocket entre abas). O `useTelefoniaFilters` e o
 * `PageHeader` rodam DE VERDADE: os filtros vem da URL (MemoryRouter) e o
 * header real (com o icone do T34) entra na varredura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { TelefoniaView } from '../TelefoniaView';

// ── Fronteiras dubladas ────────────────────────────────────────────────────
// `sessao.atual` e mutado por cada teste: e o estado da sessao SIP que escolhe
// entre `NewCallPanel` (ociosa) e `ActiveCallPanel` (chamada de pe).
const sessao = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));
const historico = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => sessao.atual,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1', name: 'Agente QA' }, user: { id: 'user-1' } }),
}));

// Papel admin: habilita o seletor Minhas/Todas e a anotacao — os dois controles
// que o agente comum nao ve precisam entrar na varredura.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ hasRole: () => true, role: 'admin' as const, loading: false }),
}));

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ addCallNotes: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/lib/calls/tabLeaderStore', () => ({
  claimLeadership: vi.fn(),
  isLeader: () => true,
}));

vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true, reason: null },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false, reason: 'Disponivel para supervisores' },
    linhaWhatsApp: null,
    rotuloLinhaWhatsApp: '',
  }),
}));

vi.mock('@/hooks/calls/useMyCalls', () => ({
  useMyCalls: () => ({
    rows: historico.rows,
    total: historico.rows.length,
    pages: 1,
    page: 1,
    paginaForaDoIntervalo: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

/** Linha do historico com os campos que a tabela e o detalhe consomem. */
const linha = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'call-1',
  channel: 'voip',
  direction: 'outbound',
  status: 'ended',
  started_at: '2026-10-08T12:00:00.000Z',
  answered_at: '2026-10-08T12:00:05.000Z',
  ended_at: '2026-10-08T12:01:35.000Z',
  end_reason: null,
  peer_number: '+5511999990001',
  peer_name: 'Contato Sintetico',
  contact_name: null,
  contact_id: null,
  contact_phone: null,
  agent_id: 'profile-1',
  agent_notes: null,
  notes: null,
  recording_status: 'none',
  total_count: 1,
  ...o,
});

/** Sessao ociosa: `status: 'idle'` mantem o painel de nova ligacao no slot. */
const SESSAO_OCIOSA = {
  session: { status: 'idle', phone: '', name: null, channel: 'voip' },
  currentNumber: '',
  callDuration: 0,
  isMuted: false,
  sipReason: null,
  status: 'idle',
  dispatch: vi.fn(),
  dial: vi.fn(),
  hangup: vi.fn(),
  openDialer: vi.fn(),
  sendDTMF: vi.fn(),
  toggleMute: vi.fn(),
  acceptIncomingCall: vi.fn(),
  rejectIncomingCall: vi.fn(),
};

/** Sessao ativa: `status: 'active'` troca o slot pelo `ActiveCallPanel`. */
const SESSAO_ATIVA = {
  ...SESSAO_OCIOSA,
  session: { status: 'active', phone: '+5511999990001', name: 'Contato Sintetico', channel: 'voip' },
  currentNumber: '+5511999990001',
  callDuration: 95,
  status: 'active',
};

const renderNaRota = (rota: string) => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[rota]}>
        <LayoutProvider value={{ hidePageBreadcrumbs: false }}>
          <TooltipProvider>
            {/* `<main>` = o container REAL da view no app (`AppShell.tsx:119`). Sem o
                marco de landmark o axe acusa `region` (moderate, "conteudo fora de
                landmark") — artefato do harness, nao da tela. Onde o app monta a view
                e o que o teste reproduz. */}
            <main>
              <TelefoniaView />
            </main>
          </TooltipProvider>
        </LayoutProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** Impactos que o aceite do plano trata como "serios". */
const SERIOUS = new Set(['critical', 'serious']);

/**
 * Inventario pinado das violacoes NAO-sérias por estado — NADA e escondido:
 * a varredura seria e afirmada como "nenhuma" e o resto e afirmado por
 * IGUALDADE. Uma moderada nova (ou uma que sumir) quebra o teste de proposito.
 */
const NAO_SERIAS: Record<string, string[]> = {
  ociosa: [],
  'chamada-ativa': [],
  'detalhe-selecionado': [],
};

const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

/**
 * Varre `document.body` (os paineis do Radix renderizam em portal; o container
 * do render ficaria vazio e a varredura seria vacuo) e aplica as duas
 * afirmacoes: o aceite (0 serias) e o inventario nao-serio por igualdade.
 */
const auditar = async (estado: keyof typeof NAO_SERIAS) => {
  const results = await axe(document.body);
  expect({
    ...results,
    violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
  }).toHaveNoViolations();
  expect(ids(results.violations.filter((v) => !SERIOUS.has(v.impact ?? '')))).toEqual(NAO_SERIAS[estado]);
};

beforeEach(() => {
  cleanup();
  sessao.atual = SESSAO_OCIOSA;
  historico.rows = [];
});

describe('Telefonia — aceite T76/T84: axe serious/critical = 0 na tela real', () => {
  it('tela OCIOSA (historico vazio + painel de nova ligacao) nao tem violacoes serias', async () => {
    renderNaRota('/telefonia');
    await auditar('ociosa');
  });

  it('CHAMADA ATIVA (painel de chamada de pe + historico com linha) nao tem violacoes serias', async () => {
    sessao.atual = SESSAO_ATIVA;
    historico.rows = [linha()];
    renderNaRota('/telefonia');
    await auditar('chamada-ativa');
  });

  it('DETALHE SELECIONADO (anotacao + registro do provedor) nao tem violacoes serias', async () => {
    historico.rows = [linha({ notes: 'Registro do provedor', agent_notes: 'Anotacao do agente' })];
    renderNaRota('/telefonia?call=call-1');
    await auditar('detalhe-selecionado');
  });
});

/**
 * Controle: prova que o matcher detecta uma violacao REAL. Um `<button>` sem
 * nome acessivel viola `button-name` (impacto `critical`): o `expect(...).not`
 * TEM que reprovar a assercao acima. Se o matcher fosse no-op — ou se o axe
 * nunca rodasse — esta varredura deixaria de acusar a violacao e o teste
 * quebraria aqui.
 */
describe('Telefonia — controle: o matcher do axe acusa violacao real', () => {
  it('um botao sem nome acessivel CONTEM button-name (matcher nao e decorativo)', async () => {
    render(<button type="button" />);
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
    expect(results).not.toHaveNoViolations();
  });
});
