/**
 * Contrato do shell de layout — trava de regressão.
 *
 * Origem: docs/design/PLANO_CORRECAO_LAYOUT_30_ETAPAS.md (etapas 2, 3, 11, 12, 14, 16, 27, 28).
 *
 * Sintoma que este arquivo trava: `<main id="main-content">` é um flex container em ROW
 * (`AppShell.tsx`). Se o filho de conteúdo não for um flex item com largura própria
 * (`flex-1`/`w-full` + `min-w-0`), ele passa a medir por conteúdo (max-content) e sobra a
 * "faixa morta" à direita, com a view encolhida e uma segunda barra de rolagem — era o que o
 * `WithHeader` (inline no `ViewRouter`) fazia antes da etapa 2 (plano, §1.1). Hoje o contrato
 * mora em `ViewContainer`, o dono único da rolagem das views comuns.
 *
 * O jsdom não calcula layout (`clientWidth === 0`), então a medida em pixels
 * (`main.clientWidth - conteudo.clientWidth <= 1` a 1920×1080, etapa 28) roda em
 * Chromium/Playwright, não aqui. O que este arquivo trava é o CONTRATO que produz a largura
 * (cadeia de flex items de largura própria + um único dono da rolagem, com o gutter vindo do
 * token de layout) e o que dá para observar no DOM: quem recebe o scroller da view e o retorno
 * ao topo na troca de view. Cada caso foi conferido em vermelho desfazendo a linha de produção
 * (ver relato do cartão).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';

// Sidebar, router e overlays não participam do contrato de largura/rolagem do shell: entram
// trocados por stubs para o teste falar só da casca (main → coluna de conteúdo → view).
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/pages/ViewRouter', () => ({
  ViewRouter: () => <div data-testid="conteudo-da-view">conteúdo da view</div>,
}));
vi.mock('@/components/layout/VoiceActionBridge', () => ({ VoiceActionBridge: () => null }));
vi.mock('@/components/calls/ActiveCallBar', () => ({ ActiveCallBar: () => null }));
vi.mock('@/components/onboarding/OnboardingChecklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/ui/route-loading-bar', () => ({ RouteLoadingBar: () => null }));
vi.mock('@/components/layout/A11yBoilerplate', () => ({ A11yBoilerplate: () => null }));
vi.mock('@/components/layout/ZenModeToggle', () => ({ ZenModeToggle: () => null }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/useSwipeNavigation', () => ({ useSwipeNavigation: () => undefined }));
vi.mock('@/hooks/ui/useNavShortcuts', () => ({ useNavShortcuts: () => undefined }));
vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceJoin: () => undefined }));

import { ViewContainer } from '../ViewContainer';
import { AppShell } from '../AppShell';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';

const SELETOR_ROLAGEM = '[class*="overflow-y-auto"]';

/** Sonda que usa o hook do MESMO jeito que as views (ex.: ScrollToTopButton em Contatos). */
const sondaRecebeu = vi.fn<(ref: RefObject<HTMLDivElement | null>) => void>();
function SondaDoScroller() {
  const ref = useLayoutScroll();
  // O efeito só observa: nada é escrito em variável de módulo durante o render.
  useEffect(() => {
    sondaRecebeu(ref);
  }, [ref]);
  return <span>conteúdo</span>;
}

describe('contrato do shell — dono único da rolagem (ViewContainer)', () => {
  beforeEach(() => {
    sondaRecebeu.mockClear();
  });

  it('a raiz do wrapper é um flex item de largura própria, não um item que mede por conteúdo', () => {
    const { container } = render(
      <ViewContainer viewId="contatos">
        <p>conteúdo</p>
      </ViewContainer>
    );

    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz).toBeTruthy();
    // Sem `w-full`/`flex-1` o item volta a dimensionar por conteúdo e a faixa morta reaparece
    // (plano §1.1); sem `min-w-0` ele estoura o main em vez de encolher (§1.2/etapa 4).
    for (const token of ['flex', 'flex-col', 'h-full', 'w-full', 'flex-1', 'min-w-0']) {
      expect(
        raiz.classList.contains(token),
        `raiz do shell sem "${token}": ${raiz.className}`
      ).toBe(true);
    }
  });

  it('o conteúdo da view fica dentro do único dono da rolagem', () => {
    const { container } = render(
      <ViewContainer viewId="contatos">
        <p>conteúdo</p>
      </ViewContainer>
    );

    // Um scroller só: o duplo (wrapper + raiz da view) era a segunda barra de rolagem (§1.3).
    const rolagem = container.querySelectorAll<HTMLElement>(SELETOR_ROLAGEM);
    expect(rolagem).toHaveLength(1);
    expect(rolagem[0].contains(screen.getByText('conteúdo'))).toBe(true);
  });

  it('a view recebe o MESMO elemento que rola e ele volta ao topo na troca de view', () => {
    const { container, rerender } = render(
      <ViewContainer viewId="contatos">
        <SondaDoScroller />
      </ViewContainer>
    );

    const rolagem = container.querySelector<HTMLElement>(SELETOR_ROLAGEM);
    expect(rolagem).toBeTruthy();
    // O ref que as views consomem (LayoutScrollContext) tem de ser o scroller de verdade —
    // senão o ScrollToTopButton observa um elemento que não rola (etapa 10).
    const chamadas = sondaRecebeu.mock.calls;
    const [refDaView] = chamadas[chamadas.length - 1] ?? [];
    expect(refDaView?.current).toBe(rolagem);

    // O div rolável sobrevive à troca de view (só o conteúdo é remontado): sem o reset por
    // viewId a view nova abriria no scrollTop da anterior.
    rolagem!.scrollTop = 300;
    rerender(
      <ViewContainer viewId="filas">
        <SondaDoScroller />
      </ViewContainer>
    );
    expect(rolagem!.scrollTop).toBe(0);
  });

  it('view full-screen (inbox/pipeline) não ganha scroller do shell', () => {
    const { container } = render(
      <ViewContainer fullScreen viewId="inbox">
        <p>inbox</p>
      </ViewContainer>
    );

    expect(container.querySelectorAll(SELETOR_ROLAGEM)).toHaveLength(0);
    expect(screen.getByText('inbox')).toBeTruthy();
  });

  it('view com rolagem própria (PageTemplate, ex.: settings) não ganha um segundo scroller', () => {
    const { container } = render(
      <ViewContainer ownScroll viewId="settings">
        <div className="overflow-y-auto">ajustes</div>
      </ViewContainer>
    );

    // Só o scroller da própria view; o shell não empilha outro em cima (§1.3).
    expect(container.querySelectorAll(SELETOR_ROLAGEM)).toHaveLength(1);
  });

  it('o gutter do shell vem do token de layout, não de um p-6 cravado (etapa 14)', () => {
    const { container } = render(
      <ViewContainer viewId="contatos">
        <p>conteúdo</p>
      </ViewContainer>
    );

    const rolagem = container.querySelector<HTMLElement>(SELETOR_ROLAGEM) as HTMLElement;
    // `--layout-gutter` existe em src/styles/tokens.css:327.
    expect(rolagem.className).toContain('p-[var(--layout-gutter)]');
    expect(/(^|\s)p-6(\s|$)/.test(rolagem.className), `gutter cravado: ${rolagem.className}`).toBe(false);
  });
});

describe('contrato do shell — coluna de conteúdo (AppShell)', () => {
  const navDirectionRef: MutableRefObject<'forward' | 'back'> = { current: 'forward' };
  const props = {
    currentView: 'contatos',
    setCurrentView: () => undefined,
    userId: 'user-1',
    canGoBack: false,
    canGoForward: false,
    goBack: () => undefined,
    goForward: () => undefined,
    breadcrumbTrail: [],
    navDirectionRef,
    profile: null,
    userEmail: 'teste@local',
    signOut: () => undefined,
    unreadNotifications: 0,
    showChecklist: false,
    loading: false,
  };

  it('a view fica numa cadeia de flex items de largura própria dentro do main', () => {
    const { container } = render(<AppShell {...props} />);

    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('aria-label')).toBe('Conteúdo principal');
    // `main` é o container em row: o filho de conteúdo tem de poder crescer e encolher.
    for (const token of ['flex', 'flex-1', 'min-w-0']) {
      expect(main.classList.contains(token), `main sem "${token}": ${main.className}`).toBe(true);
    }

    const coluna = main.firstElementChild as HTMLElement;
    expect(coluna.classList.contains('flex-1')).toBe(true);
    expect(coluna.classList.contains('min-w-0')).toBe(true);
    expect(coluna.classList.contains('flex-col')).toBe(true);

    const linha = coluna.firstElementChild as HTMLElement;
    expect(linha.classList.contains('flex-1')).toBe(true);
    expect(linha.classList.contains('min-w-0')).toBe(true);
    expect(linha.contains(screen.getByTestId('conteudo-da-view'))).toBe(true);

    // Nenhum degrau entre o main e a view pode ser um flex item sem `min-w-0`.
    const raizDoShell = container.firstElementChild as HTMLElement;
    expect(raizDoShell.contains(main)).toBe(true);
  });

  it('o shell é preso à altura da viewport dinâmica, não a 100vh (etapa 16)', () => {
    const { container } = render(<AppShell {...props} />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.classList.contains('h-[100dvh]')).toBe(true);
    expect(raiz.classList.contains('h-screen')).toBe(true); // fallback
  });
});
