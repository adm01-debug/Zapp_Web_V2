import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const db = vi.hoisted(() => ({
  notes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'contact_notes') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: db.notes, error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`tabela nao mockada: ${table}`);
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    motion: new Proxy(
        {},
        {
          get: (_t, tag: string) => (props: Record<string, unknown>) => {
            const { children, initial, animate, exit, transition, layout, ...rest } = props;
            return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
          },
        },
      ),
      AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      useReducedMotion: vi.fn(() => null),
  };
});

vi.mock('@/components/inbox/collaboration/MentionInput', () => ({
  MentionInput: () => <div />,
}));

const nomesMock = vi.hoisted(() => ({ nomes: undefined as undefined | string[] }));
vi.mock('@/hooks/inbox/useMentionableProfiles', () => ({
  useMentionableProfileNames: () => ({ data: nomesMock.nomes }),
}));

import { InternalNotesPanel } from '../InternalNotesPanel';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <InternalNotesPanel contactId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.notes = [];
  nomesMock.nomes = undefined;
  cleanup();
});

/**
 * O selo passou a depender da lista de nomes ativos (consulta auxiliar).
 * Enquanto ela está indisponível (carregando ou erro), a nota não pode
 * perder os selos: cai no comportamento anterior (`@palavra` vira selo).
 */
describe('InternalNotesPanel — selo com a lista de nomes indisponível', () => {
  it('sem nomes (consulta auxiliar falhou): `@ana` continua selo', async () => {
    nomesMock.nomes = undefined;
    db.notes = [
      {
        id: 'n1',
        content: 'Falar com @ana sobre o pedido',
        created_at: '2026-01-06T12:00:00',
        author: { id: 'a1', name: 'Ana Lima', avatar_url: null },
      },
    ];
    renderPanel();

    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByText(/Falar com/)).toBeInTheDocument();
    expect(screen.getByText(/sobre o pedido/)).toBeInTheDocument();
  });

  it('com nomes: `@Ana Lima` vira UM selo com o nome inteiro', async () => {
    nomesMock.nomes = ['Ana Lima'];
    db.notes = [
      {
        id: 'n1',
        content: 'Falar com @Ana Lima sobre o pedido',
        created_at: '2026-01-06T12:00:00',
        author: { id: 'a1', name: 'Ana Lima', avatar_url: null },
      },
    ];
    renderPanel();

    expect(await screen.findByText('@Ana Lima')).toBeInTheDocument();
    expect(screen.getByText(/Falar com/)).toBeInTheDocument();
    expect(screen.getByText(/sobre o pedido/)).toBeInTheDocument();
  });

  it('escapa pontuação no nome sem quebrar o reconhecimento da menção', async () => {
    nomesMock.nomes = ['Ana (Suporte)'];
    db.notes = [
      {
        id: 'n1',
        content: 'Falar com @Ana (Suporte) sobre o pedido',
        created_at: '2026-01-06T12:00:00',
        author: { id: 'a1', name: 'Ana (Suporte)', avatar_url: null },
      },
    ];
    renderPanel();

    expect(await screen.findByText('@Ana (Suporte)')).toBeInTheDocument();
    expect(screen.getByText(/sobre o pedido/)).toBeInTheDocument();
  });
});
