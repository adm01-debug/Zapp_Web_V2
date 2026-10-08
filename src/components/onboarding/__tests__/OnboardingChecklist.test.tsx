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

import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';

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
});
