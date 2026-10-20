/**
 * Y18-3 / SHELL-04, SHELL-05, SHELL-06, SHELL-17 — tour de onboarding.
 *
 * SHELL-05 (P1): no celular o casco não monta o `Sidebar` do desktop, então não existe
 * nenhum `[data-tour]` no DOM. Antes: o overlay tentava 10 vezes de 200 ms por passo e
 * avançava sozinho até o fim — tour "rodava" sem mostrar um cartão sequer. Agora os
 * passos são filtrados pelos alvos que existem no DOM; sem nenhum, o cartão não abre e
 * o "Iniciar Tour Guiado" do WelcomeModal não é oferecido.
 *
 * SHELL-04: o X do cartão não tinha nome acessível (`aria-label="Fechar tour"`).
 * SHELL-06: o cartão não era `role="dialog"`/`aria-modal`/nomeado, não recebia o foco e
 * o Tab passeava pelo menu atrás do overlay.
 * SHELL-17: as bolinhas de passo eram `motion.div` com `onClick` — só ponteiro.
 *
 * jsdom não tem layout: `getBoundingClientRect` devolve zeros e o overlay trata medida
 * zero como alvo invisível. A medida é stubbada aqui (mesma nota do
 * defaultTourSteps.alvos.test.tsx) para isolar o que é "alvo ausente" de "sem layout".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TourProvider, useTour, DEFAULT_ONBOARDING_STEPS } from '../OnboardingTour';
import { WelcomeModal } from '../WelcomeModal';

const TODOS_OS_ALVOS = DEFAULT_ONBOARDING_STEPS.map((passo) => passo.id);

function AlvosDoTour({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <div key={id} data-tour={id} aria-label={`alvo ${id}`} />
      ))}
    </>
  );
}

function TourDriver({ alvos }: { alvos: string[] }) {
  const { isActive, currentStep, startTour, steps } = useTour();
  return (
    <main>
      <AlvosDoTour ids={alvos} />
      <span data-testid="tour-ativo">{String(isActive)}</span>
      <span data-testid="tour-passo">{currentStep}</span>
      <span data-testid="tour-total">{steps.length}</span>
      <button data-testid="tour-iniciar" onClick={() => startTour(DEFAULT_ONBOARDING_STEPS)}>
        Iniciar tour
      </button>
    </main>
  );
}

function renderTour(alvos: string[] = TODOS_OS_ALVOS, onComplete?: () => void) {
  return render(
    <TourProvider onComplete={onComplete}>
      <TourDriver alvos={alvos} />
    </TourProvider>,
  );
}

/** Abre o tour e espera o cartão. */
async function abrirTour(alvos: string[] = TODOS_OS_ALVOS) {
  renderTour(alvos);
  fireEvent.click(screen.getByTestId('tour-iniciar'));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 40, y: 40, top: 40, left: 40, right: 120, bottom: 120, width: 80, height: 80,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SHELL-05 — sem alvo de tour no DOM (casco do celular) o tour não abre', () => {
  it('não abre cartão nenhum e não avança sozinho pelos passos vazios', async () => {
    const onComplete = vi.fn();
    renderTour([], onComplete);

    fireEvent.click(screen.getByTestId('tour-iniciar'));
    expect(screen.getByTestId('tour-ativo').textContent).toBe('true');

    // Antes da correção cada passo esgotava as 10 tentativas de 200 ms e chamava
    // nextStep: em ~2 s o tour já estava no passo 2 e terminava sozinho no último
    // (chamando o onComplete) sem ter exibido nada.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Passo \d+ de \d+/)).toBeNull();
    expect(screen.getByTestId('tour-passo').textContent).toBe('0');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('o WelcomeModal esconde "Iniciar Tour Guiado" quando não há alvo no DOM', () => {
    render(<WelcomeModal isOpen onClose={vi.fn()} onStartTour={vi.fn()} userName="Ana" />);

    expect(screen.queryByRole('button', { name: /iniciar tour guiado/i })).toBeNull();
    // O modal continua utilizável: a saída para quem não tem tour é o "Pular tour".
    expect(screen.getByRole('button', { name: /pular tour/i })).toBeInTheDocument();
  });

  it('o WelcomeModal mostra o botão quando os alvos existem e ele dispara o tour', () => {
    const onStartTour = vi.fn();
    // O alvo já está no DOM antes de o modal abrir: no app o `AppShell` (com o Sidebar)
    // é montado num commit anterior, porque o `showWelcome` é ligado em efeito.
    render(<div data-tour="inbox" />);
    render(<WelcomeModal isOpen onClose={vi.fn()} onStartTour={onStartTour} />);

    const botao = screen.getByRole('button', { name: /iniciar tour guiado/i });
    fireEvent.click(botao);

    expect(onStartTour).toHaveBeenCalledTimes(1);
  });
});

describe('SHELL-06 — o cartão do tour é um diálogo modal nomeado com o foco dentro', () => {
  it('abre com role=dialog, aria-modal e nome acessível vindo do título do passo', async () => {
    const cartao = await abrirTour();

    expect(cartao).toHaveAttribute('aria-modal', 'true');
    expect(cartao).toHaveAttribute('aria-labelledby', 'tour-passo-titulo');
    expect(screen.getByRole('dialog', { name: 'Inbox de Conversas' })).toBeInTheDocument();
  });

  it('move o foco para o cartão ao abrir e devolve ao elemento anterior ao fechar', async () => {
    renderTour();
    const iniciar = screen.getByTestId('tour-iniciar');
    iniciar.focus();

    fireEvent.click(iniciar);
    const cartao = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(cartao));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(iniciar);
  });

  it('prende o foco no cartão: Tab do último volta ao primeiro e do primeiro volta ao último', async () => {
    const cartao = await abrirTour();
    const focaveis = Array.from(cartao.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];

    ultimo.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(primeiro);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it('Tab com o foco fora do cartão (menu atrás do overlay) puxa o foco para dentro', async () => {
    const cartao = await abrirTour();
    const focaveis = Array.from(cartao.querySelectorAll<HTMLElement>('button:not([disabled])'));

    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(document.activeElement).toBe(focaveis[0]);
  });

  it('axe: sem violação de region nem button-name com o cartão aberto', async () => {
    await abrirTour();

    const resultado = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    const ids = resultado.violations.map((violacao) => violacao.id);

    expect(ids).not.toContain('region');
    expect(ids).not.toContain('button-name');
  });
});

describe('SHELL-04 — o fechar do cartão do tour tem nome acessível', () => {
  it('o X se anuncia como "Fechar tour"', async () => {
    await abrirTour();

    expect(screen.getByRole('button', { name: 'Fechar tour' })).toBeInTheDocument();
  });
});

describe('SHELL-17 — as bolinhas de passo são botões com nome', () => {
  it('cada passo vira um botão "Ir ao passo N" que leva ao passo', async () => {
    await abrirTour();

    const bolinhas = screen.getAllByRole('button', { name: /^Ir ao passo \d+$/ });
    expect(bolinhas).toHaveLength(DEFAULT_ONBOARDING_STEPS.length);

    fireEvent.click(screen.getByRole('button', { name: 'Ir ao passo 3' }));

    await screen.findByRole('dialog', { name: 'Dashboard & Métricas' });
    expect(screen.getByTestId('tour-passo').textContent).toBe('2');
  });
});

describe('desktop continua igual: todos os alvos presentes = os 6 passos do tour padrão', () => {
  it('mostra os 6 passos e fecha pelo "Concluir"', async () => {
    await abrirTour();

    expect(screen.getByText(`Passo 1 de ${DEFAULT_ONBOARDING_STEPS.length}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ir ao passo 6' }));

    await screen.findByText('Personalização');
    expect(screen.getByText(`Passo 6 de ${DEFAULT_ONBOARDING_STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument();
  });

  it('alvo ausente não vira passo vazio: o "Próximo" pula para o próximo passo que existe', async () => {
    await abrirTour(TODOS_OS_ALVOS.filter((id) => id !== 'queues'));

    // 5 dos 6 passos têm alvo (o das Filas não está no DOM): 5 bolinhas.
    expect(screen.getAllByRole('button', { name: /^Ir ao passo \d+$/ })).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Ir ao passo 3' }));
    await screen.findByText('Dashboard & Métricas');

    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));

    await screen.findByText('Central de Notificações');
    expect(screen.queryByText('Filas de Atendimento')).toBeNull();
    expect(screen.getByTestId('tour-passo').textContent).toBe('4');
  });
});
