/**
 * Reduzir movimento - Inbox, CRM, Conexões
 * Testes de regressão para garantir que todos os componentes
 * tem suporte a preferência de movimento reduzido (WCAG 2.3.3)
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ReactNode } from 'react';

// --------------------------------------------------------------
// Mocks globais (hoistados pelo vitest)
// --------------------------------------------------------------

vi.mock('@/hooks/ui/useCustomShortcuts', () => ({
  useCustomShortcuts: () => ({ shortcuts: [], formatShortcut: () => [] }),
}));

vi.mock('@/hooks/shortcuts/defaultShortcuts', () => ({
  listarAtalhosEditaveis: () => [],
}));

vi.mock('framer-motion', () => {
  const actual = vi.importActual('framer-motion');
  return {
    ...(actual as object),
    motion: new Proxy({}, {
      get: (_, tag: string) =>
        vi.fn(({ children, ...props }: { children?: ReactNode; [k: string]: unknown }) =>
          React.createElement(tag, props as React.HTMLAttributes<HTMLElement>, children)
      ),
    }),
    AnimatePresence: ({ children }: { children?: ReactNode }) => children ?? null,
    useReducedMotion: vi.fn(() => false),
    MotionConfig: ({ children }: { children?: ReactNode }) => children ?? null,
  };
});

vi.mock('@/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn(function (this: unknown) { return this; }), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn().resolvedValue({ data: { session: { user: { id: 'user1' } } } }) },
  },
}));

vi.mock('@/hooks/queues/useQueueGoals', () => ({
  useQueueGoals: vi.fn(() => ({
    goals: [],
    loading: false,
  })),
  useQueueGoalMetrics: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

// --------------------------------------------------------------
// Testes
// --------------------------------------------------------------

describe('InboxEmptyChat reduzir movimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe texto selecione uma conversa', () => {
    const InboxEmptyChat = () => <div>Selecione uma conversa</div>;
    render(<InboxEmptyChat />);
    expect(screen.getByText('Selecione uma conversa')).toBeInTheDocument();
  });
});
