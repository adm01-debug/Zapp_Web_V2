/**
 * N-195 — interruptores Sentry sem nome acessível.
 *
 * Prova que os switches "Performance" e "Session Replay" possuem
 * aria-label e o axe não aponta violações de nome acessível
 * (aria-toggle-field-name).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    activeAccount: null,
    disconnectGmail: { mutate: vi.fn() },
    syncInbox: { mutate: vi.fn(), isPending: false },
    connectGmail: { mutate: vi.fn(), isPending: false },
  }),
}));

import { SentryIntegrationView } from '../SentryIntegrationView';

describe('a11y: SentryIntegrationView — nomes acessíveis em switches (N-195)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('o switch Performance tem nome acessível', () => {
    render(<SentryIntegrationView />);
    expect(screen.getByRole('switch', { name: 'Performance' })).toBeInTheDocument();
  });

  it('o switch Session Replay tem nome acessível', () => {
    render(<SentryIntegrationView />);
    expect(screen.getByRole('switch', { name: 'Session Replay' })).toBeInTheDocument();
  });

  it('axe não acusa switches sem nome (aria-toggle-field-name)', async () => {
    const { container } = render(<SentryIntegrationView />);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});