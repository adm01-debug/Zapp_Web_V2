/**
 * N-195 — interruptor Google Calendar sem nome acessível.
 *
 * Prova que o switch "Sincronização automática" possui
 * aria-label e o axe não aponta violações de nome acessível
 * (aria-toggle-field-name).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';

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

import { GoogleCalendarIntegration } from '../GoogleCalendarIntegration';

function renderComProvider() {
  return render(
    <TooltipProvider>
      <GoogleCalendarIntegration />
    </TooltipProvider>,
  );
}

describe('a11y: GoogleCalendarIntegration — nome acessível no switch (N-195)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('o switch Sincronização automática tem nome acessível', () => {
    renderComProvider();
    expect(screen.getByRole('switch', { name: 'Sincronização automática' })).toBeInTheDocument();
  });

  it('axe não acusa switch sem nome (aria-toggle-field-name)', async () => {
    const { container } = renderComProvider();

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});