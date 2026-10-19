/**
 * N-079 — nomes acessíveis (régua axe: `button-name` / `aria-progressbar-name`).
 *
 * A régua e2e (`e2e/a11y-tarefas-dashboard.spec.ts`) roda em 390x844 e 1280x720
 * e exige nome acessível nos botões de modo do `ModeSwitcher` e no progresso do
 * `OnboardingChecklist`.
 *
 * Por que o `aria-label` é EXIGIDO e o teste não aceita só o texto visível:
 * no `ModeSwitcher` o rótulo do botão mora em `<span className="hidden sm:inline">`
 * — em 390 o `display:none` tira o texto do nome acessível, então o `aria-label`
 * é a ÚNICA fonte do nome no celular. O jsdom não tem layout nem media query
 * (o CSS do Tailwind não entra: `css` está desligado no vitest.config.ts), então
 * aqui a única forma fiel de provar o nome em 390 é exigir o `aria-label`
 * explícito — que vale nos dois tamanhos — em vez do texto do `<span>`.
 *
 * Os dois achados que o cartão descreve são o mesmo defeito em dois arquivos, e
 * o cartão só autoriza UM arquivo de teste novo (este); por isso o
 * `ModeSwitcher` é exercitado aqui, com o componente real, e não por mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { ModeSwitcher } from '@/components/tasks/shared/ModeSwitcher';

/** Encadeamento do query builder do Supabase usado pelos passos do checklist. */
function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return builder;
}

/** Nenhum passo concluído: o checklist renderiza (não cai no `return null`). */
function mockSupabaseSemNada() {
  mockFrom.mockImplementation(() => chain({ data: null, error: null }));
}

describe('N-079 — nomes acessíveis (mode switcher e progresso do checklist)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockSupabaseSemNada();
  });

  it('cada botão de modo do ModeSwitcher tem o rótulo como aria-label e diz se está pressionado', () => {
    render(<ModeSwitcher mode="list" onChange={vi.fn()} />);

    for (const rotulo of ['Lista', 'Quadro', 'Agenda']) {
      // o nome acessível que o leitor de tela lê — e que sobrevive ao `hidden sm:inline`
      const botao = screen.getByRole('button', { name: rotulo });
      expect(botao.getAttribute('aria-label')).toBe(rotulo);
    }

    // o mesmo estado visual do modo ativo também está no estado acessível
    expect(screen.getByRole('button', { name: 'Lista' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Quadro' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('o progresso do checklist tem nome acessível e os dois botões de ícone têm aria-label', async () => {
    render(<OnboardingChecklist onNavigate={vi.fn()} />);

    await screen.findByText(/passos concluídos/);

    const progresso = screen.getByRole('progressbar', { name: 'Progresso do onboarding' });
    expect(progresso.getAttribute('aria-label')).toBe('Progresso do onboarding');

    // os dois `size="icon"` h-8 w-8 não têm texto: o nome vem só do aria-label
    expect(screen.getByRole('button', { name: 'Recolher checklist' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dispensar checklist' })).toBeTruthy();
  });

  it('o progresso do modo compacto também tem nome acessível', async () => {
    render(<OnboardingChecklist compact onDismiss={vi.fn()} />);

    await screen.findByText(/passos concluídos/);

    expect(screen.getByRole('progressbar', { name: 'Progresso do onboarding' })).toBeTruthy();
    // o X do compacto também é um `icon` sem texto
    expect(screen.getByRole('button', { name: 'Dispensar checklist' })).toBeTruthy();
  });
});
