import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
}));

let reduceMotion = false;
/** Props de cada motion.div renderizado pelo componente, na ordem de renderização. */
const motionDivProps: Array<Record<string, unknown>> = [];
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const { createElement } = await import('react');
  const makeMotionComponent = (tag: string) => {
    const MotionComponent = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
      if (tag === 'div') motionDivProps.push(props);
      const domProps: Record<string, unknown> = { ...props };
      for (const key of ['animate', 'initial', 'exit', 'transition', 'whileHover', 'whileTap']) delete domProps[key];
      return createElement(tag, domProps, children);
    };
    return MotionComponent;
  };
  const motion = new Proxy({}, { get: (_target, tag: string) => makeMotionComponent(tag) });
  return {
    ...actual,
    useReducedMotion: () => reduceMotion,
    motion,
  };
});

import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';

/** Props do motion.div do ícone Sparkles: o único com o gradiente bg-gradient-to-br. */
function iconeSparklesProps() {
  return motionDivProps.find(
    (props) => typeof props.className === 'string' && props.className.includes('bg-gradient-to-br'),
  );
}

/** Encadeamento do query builder do Supabase usado pelos passos do checklist. */
function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return builder;
}

/** Só o tema varia: os outros passos ficam sempre incompletos. */
function mockSupabaseComUserSettings(userSettingsResult: unknown) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_settings') return chain(userSettingsResult);
    if (table === 'profiles') return chain({ data: { name: null, avatar_url: null }, error: null });
    return chain({ data: [], error: null });
  });
}

describe('OnboardingChecklist — passo "Personalize seu tema"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    reduceMotion = false;
    motionDivProps.length = 0;
  });

  it('não marca o tema como concluído quando a consulta não devolve configuração', async () => {
    // maybeSingle() sem linha => { data: null, error: null }
    mockSupabaseComUserSettings({ data: null, error: null });
    const onNavigate = vi.fn();

    render(<OnboardingChecklist onNavigate={onNavigate} />);

    const progresso = await screen.findByText(/passos concluídos/);
    expect(progresso.textContent).toBe('0 de 6 passos concluídos');

    const acao = screen.getByRole('button', { name: /Personalizar/ });
    fireEvent.click(acao);
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('não marca o tema como concluído quando a configuração existe com theme null', async () => {
    mockSupabaseComUserSettings({ data: { theme: null }, error: null });

    render(<OnboardingChecklist />);

    const progresso = await screen.findByText(/passos concluídos/);
    expect(progresso.textContent).toBe('0 de 6 passos concluídos');
    expect(screen.getByRole('button', { name: /Personalizar/ })).toBeTruthy();
  });

  it('não marca o tema como concluído quando o tema é "system"', async () => {
    mockSupabaseComUserSettings({ data: { theme: 'system' }, error: null });

    render(<OnboardingChecklist />);

    const progresso = await screen.findByText(/passos concluídos/);
    expect(progresso.textContent).toBe('0 de 6 passos concluídos');
    expect(screen.getByRole('button', { name: /Personalizar/ })).toBeTruthy();
  });

  it('marca o tema como concluído quando a configuração traz um tema definido', async () => {
    mockSupabaseComUserSettings({ data: { theme: 'light' }, error: null });

    render(<OnboardingChecklist />);

    const progresso = await screen.findByText(/passos concluídos/);
    expect(progresso.textContent).toBe('1 de 6 passos concluídos');
    expect(screen.queryByRole('button', { name: /Personalizar/ })).toBeNull();
  });

  it('botão expandir tem nome acessível "Expandir passos" quando recolhido', async () => {
    mockSupabaseComUserSettings({ data: null, error: null });

    render(<OnboardingChecklist />);

    await screen.findByText(/passos concluídos/);

    const botaoRecolher = screen.getByRole('button', { name: 'Recolher passos' });
    fireEvent.click(botaoRecolher);

    const botaoExpandir = screen.getByRole('button', { name: 'Expandir passos' });
    expect(botaoExpandir).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recolher passos' })).toBeNull();
  });

  it('botão dispensar tem nome acessível "Dispensar configuração da conta"', async () => {
    mockSupabaseComUserSettings({ data: null, error: null });

    render(<OnboardingChecklist />);

    await screen.findByText(/passos concluídos/);

    expect(screen.getByRole('button', { name: 'Dispensar configuração da conta' })).toBeTruthy();
  });

  it('barra de progresso tem nome acessível "Progresso da configuração da conta"', async () => {
    mockSupabaseComUserSettings({ data: null, error: null });

    render(<OnboardingChecklist />);

    await screen.findByText(/passos concluídos/);

    expect(screen.getByRole('progressbar', { name: 'Progresso da configuração da conta' })).toBeTruthy();
  });

  it('com prefers-reduced-motion o ícone não anima: animate e transition ficam indefinidos', async () => {
    reduceMotion = true;
    mockSupabaseComUserSettings({ data: null, error: null });

    render(<OnboardingChecklist />);

    await screen.findByText(/passos concluídos/);

    const icone = iconeSparklesProps();
    expect(icone).toBeTruthy();
    expect(icone?.animate).toBeUndefined();
    expect(icone?.transition).toBeUndefined();
  });

  it('sem prefers-reduced-motion o ícone anima: animate rotaciona e transition repete infinitamente', async () => {
    reduceMotion = false;
    mockSupabaseComUserSettings({ data: null, error: null });

    render(<OnboardingChecklist />);

    await screen.findByText(/passos concluídos/);

    const icone = iconeSparklesProps();
    expect(icone).toBeTruthy();
    expect(icone?.animate).toEqual({ rotate: [0, 10, -10, 0] });
    expect(icone?.transition).toEqual({ duration: 2, repeat: Infinity });
  });
});