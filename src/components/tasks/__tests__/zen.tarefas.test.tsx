/**
 * CP-H / etapa 83 — o modo zen NO módulo de Tarefas (trava de regressão).
 *
 * Origem: `docs/design/TAREFAS_QUADRO_STATUS.md` — o CP-H fecha com
 * "zen=aberta — nao verificada (garantia apenas por construcao)" e o inventário
 * de 07/10 (`docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv`, CP-H) registra a
 * lacuna como "nenhuma referência a zen em `src/components/tasks`". O
 * comportamento existia por construção, sem prova.
 *
 * O zen é decidido pelo shell (`AppShell`, estado em `useZenMode` + localStorage
 * 'zen-mode') e chega ao módulo por dois caminhos:
 *
 *   1. a sidebar do desktop sai (`!isMobile && !isZen`) — sobra a área de trabalho;
 *   2. o `LayoutContext` passa `hidePageBreadcrumbs: !isMobile && !isZen`, então o
 *      `PageHeader` do PRÓPRIO módulo volta a desenhar a trilha ("Início /
 *      Tarefas") — é o caminho de navegação que resta com a sidebar fora.
 *
 * O `TasksModule` não tem chrome próprio de zen: o que ele precisa garantir é
 * entregar as breadcrumbs dessa trilha e continuar inteiro quando o zen está
 * ligado. É isso que este arquivo trava, entrando pelo estado REAL do shell
 * (`localStorage['zen-mode']`, o mesmo que o `useZenMode` lê) e não por um
 * `LayoutProvider` montado à mão — esse provaria só o `PageHeader`, que já tem
 * o seu contrato em `layout/__tests__/PageHeader.trilha.test.tsx`.
 *
 * `jsdom` não calcula layout: a medida em pixels do DoD original
 * (`scrollWidth <= innerWidth` a 390x844, no painel do chat) é do navegador e já
 * está registrada no ledger (CP-L, 02/10: Lista/Quadro/Agenda 390 = 390). Aqui
 * se trava comportamento, não largura.
 *
 * Cada caso foi conferido em VERMELHO desfazendo a linha de produção (ver relato
 * do cartão SL-234): `!isZen` fora da condição da sidebar, `!isZen` fora de
 * `hidePageBreadcrumbs` e as `breadcrumbs` fora do `PageHeader` do módulo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';

// --- Fronteiras do shell ----------------------------------------------------
// A sidebar entra como stub: é pesada (perfil, navegação, badge) e o que este
// teste observa é a CONDIÇÃO do `AppShell` — ela é montada ou não em zen. O
// `ViewRouter` entra apontando para o módulo REAL, que é o objeto do cartão.
vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="shell-sidebar" />,
}));
vi.mock('@/pages/ViewRouter', async () => {
  // import tardio: o factory do `vi.mock` roda antes dos imports deste arquivo.
  const { TasksModule } = await import('@/components/tasks/TasksModule');
  return { ViewRouter: () => <TasksModule /> };
});
vi.mock('@/components/layout/VoiceActionBridge', () => ({ VoiceActionBridge: () => null }));
vi.mock('@/components/calls/ActiveCallBar', () => ({ ActiveCallBar: () => null }));
vi.mock('@/components/onboarding/OnboardingChecklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/ui/route-loading-bar', () => ({ RouteLoadingBar: () => null }));
vi.mock('@/components/layout/A11yBoilerplate', () => ({ A11yBoilerplate: () => null }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/useSwipeNavigation', () => ({ useSwipeNavigation: () => undefined }));
vi.mock('@/hooks/ui/useNavShortcuts', () => ({ useNavShortcuts: () => undefined }));
vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceJoin: () => undefined }));

import { AppShell } from '@/components/layout/AppShell';

const ZEN_KEY = 'zen-mode';

const props = {
  currentView: 'tasks',
  setCurrentView: () => undefined,
  userId: 'u1',
  canGoBack: false,
  canGoForward: false,
  goBack: () => undefined,
  goForward: () => undefined,
  breadcrumbTrail: [] as string[],
  navDirectionRef: { current: 'forward' } as React.MutableRefObject<'forward' | 'back'>,
  profile: null,
  userEmail: 'teste@local',
  signOut: () => undefined,
  unreadNotifications: 0,
  showChecklist: false,
  loading: false,
};

function renderTarefas() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper>
          <AppShell {...props} />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** A trilha do `PageHeader` — o shadcn a monta como `<nav aria-label="breadcrumb">`. */
function trilha(container: HTMLElement) {
  return container.querySelector<HTMLElement>('nav[aria-label="breadcrumb"]');
}

/**
 * Etapas 065/067 — os grupos da Lista nascem recolhidos; a preferência do
 * navegador (localStorage) entra com tudo aberto para a prova ver as linhas.
 */
function semearGruposAbertos() {
  window.localStorage.setItem(
    'tasks-list-groups',
    JSON.stringify({ atrasadas: true, hoje: true, amanha: true, proximas: true, 'sem-prazo': true, concluidas: true })
  );
}

describe('modo zen — módulo de Tarefas (CP-H / etapa 83)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    semearGruposAbertos();
    window.history.replaceState(null, '', '/');
    setSelectResult({ data: [makeTaskRow()], error: null });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('com o zen ligado: a sidebar sai, a trilha do módulo volta e o módulo segue inteiro', async () => {
    localStorage.setItem(ZEN_KEY, 'true');

    const { container } = renderTarefas();

    await screen.findByTestId('tasks-module');
    await screen.findByText('Ligar para o cliente');

    // 1) o zen tira a sidebar: a área de trabalho fica sozinha.
    expect(screen.queryByTestId('shell-sidebar')).toBeNull();

    // 2) o cabeçalho DO MÓDULO volta a desenhar a trilha — com a sidebar fora,
    //    é ela o caminho de navegação que resta.
    const nav = trilha(container);
    expect(nav, 'sem a trilha do módulo com o zen ligado').not.toBeNull();
    expect(within(nav as HTMLElement).getByText('Início')).toBeTruthy();
    expect(within(nav as HTMLElement).getByText('Tarefas')).toBeTruthy();

    // 3) nada do módulo some por causa do zen: título, os 5 KPIs, a captura, a
    //    barra de filtros, a troca de modo e as tarefas carregadas.
    expect(screen.getByRole('heading', { name: 'Tarefas' })).toBeTruthy();
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(5);
    expect(screen.getByTestId('quick-add-input')).toBeTruthy();
    expect(screen.getByTestId('tasks-filter-bar')).toBeTruthy();
    expect(screen.getByTestId('tasks-mode')).toBeTruthy();
    expect(screen.getByTestId('task-row')).toBeTruthy();
  });

  it('sem zen (desktop): a sidebar está na tela e a trilha NÃO aparece — é o zen que a traz', async () => {
    const { container } = renderTarefas();

    await screen.findByTestId('tasks-module');
    await screen.findByText('Ligar para o cliente');

    expect(screen.getByTestId('shell-sidebar')).toBeTruthy();
    expect(trilha(container)).toBeNull();
    // o módulo é o mesmo nas duas situações: o zen só troca a casca e o topo.
    expect(screen.getByRole('heading', { name: 'Tarefas' })).toBeTruthy();
    expect(screen.getByTestId('task-row')).toBeTruthy();
  });

  it('Esc sai do zen: a sidebar volta, a trilha sai de cena e a preferência é gravada', async () => {
    localStorage.setItem(ZEN_KEY, 'true');

    const { container } = renderTarefas();

    await screen.findByTestId('tasks-module');
    await screen.findByText('Ligar para o cliente');
    expect(screen.queryByTestId('shell-sidebar')).toBeNull();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    await waitFor(() => expect(screen.getByTestId('shell-sidebar')).toBeTruthy());
    expect(trilha(container)).toBeNull();
    expect(localStorage.getItem(ZEN_KEY)).toBe('false');
    expect(screen.getByTestId('tasks-module')).toBeTruthy();
  });
});
