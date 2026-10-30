import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/mocks/queryClient';
import { InternalNotesPanel } from '../InternalNotesPanel';
import { ContactNotes } from '@/components/contacts/ContactNotes';

/**
 * R2-SYNC — "nota criada no popover não aparece na aba Notas sem recarregar".
 *
 * O popover de colaboração escrevia a nota e invalidava só `['internal-notes']`.
 * A aba Notas do detalhe do contato (`ContactNotes`) lia por conta própria, sem
 * entrar no cache do react-query — então as duas telas divergiam até um reload.
 *
 * O teste renderiza os DOIS componentes reais sob o MESMO QueryClient: cria a
 * nota no popover e verifica que ela aparece na aba Notas, sem remontar nada.
 */

const h = vi.hoisted(() => ({
  notes: [] as Array<Record<string, unknown>>,
  profiles: [{ id: 'profile-me', name: 'Íris', avatar_url: null }] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { id: 'profile-me' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// A aba Notas lê pelo serviço (useContactNotes); o popover lê pelo supabase.
vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchNotes: vi.fn(async () =>
      h.notes.map((n) => ({
        ...n,
        author: h.profiles.find((p) => p.id === n.author_id) ?? undefined,
      })),
    ),
    addNote: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = (table: string) => {
    const q: Record<string, unknown> = { _op: 'select', _filters: {} as Record<string, unknown> };
    const self = () => q;
    q.select = vi.fn(self);
    q.eq = vi.fn((col: string, val: unknown) => {
      (q._filters as Record<string, unknown>)[col] = val;
      return q;
    });
    q.order = vi.fn(self);
    q.limit = vi.fn(self);
    q.range = vi.fn(self);
    q.in = vi.fn(self);
    q.single = vi.fn(() => {
      q._single = true;
      return q;
    });
    q.insert = vi.fn((row: Record<string, unknown>) => {
      q._op = 'insert';
      q._row = row;
      return q;
    });
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let result: unknown;
      if (q._op === 'insert') {
        const row = q._row as Record<string, unknown>;
        h.notes.push({
          id: `nota-${h.notes.length + 1}`,
          contact_id: row.contact_id,
          author_id: row.author_id,
          content: row.content,
          category: 'note',
          is_done: false,
          due_date: null,
          created_at: '2026-10-13T12:00:00.000Z',
          updated_at: '2026-10-13T12:00:00.000Z',
        });
        result = { data: null, error: null };
      } else if (table === 'contact_notes') {
        result = {
          data: h.notes.map((n) => ({
            id: n.id,
            content: n.content,
            created_at: n.created_at,
            author: h.profiles.find((p) => p.id === n.author_id) ?? null,
          })),
          error: null,
        };
      } else if (q._single) {
        result = { data: { id: 'profile-me' }, error: null };
      } else {
        result = { data: h.profiles, error: null };
      }
      return Promise.resolve(result).then(onOk, onErr);
    };
    return q;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => buildQuery(table)),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    },
  };
});

const NOTA_ANTIGA = {
  id: 'nota-antiga',
  contact_id: 'contato-1',
  author_id: 'profile-colega',
  content: 'Nota antiga do colega',
  category: 'note',
  is_done: false,
  due_date: null,
  created_at: '2026-10-12T12:00:00.000Z',
  updated_at: '2026-10-12T12:00:00.000Z',
};

function renderAmbas() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <div data-testid="popover"><InternalNotesPanel contactId="contato-1" /></div>
      <div data-testid="aba-notas"><ContactNotes contactId="contato-1" /></div>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.notes = [NOTA_ANTIGA];
  h.profiles = [
    { id: 'profile-me', name: 'Íris', avatar_url: null },
    { id: 'profile-colega', name: 'Colega', avatar_url: null },
  ];
});

describe('Notas · popover e aba sincronizados', () => {
  it('nota criada no popover aparece na aba Notas do contato sem recarregar', async () => {
    renderAmbas();

    // Estado inicial: a aba Notas mostra só a nota antiga.
    const aba = screen.getByTestId('aba-notas');
    expect(await screen.findByText('Nota antiga do colega')).toBeInTheDocument();
    expect(aba.textContent).not.toContain('Nota nova do popover');

    // Cria a nota no popover (o input é o MentionInput real).
    const input = screen.getByPlaceholderText('Adicionar nota... (@nome para mencionar)');
    fireEvent.change(input, { target: { value: 'Nota nova do popover' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comentário com menção' }));

    // A invalidação de `contactNotesKey` faz a aba Notas reler e exibir a nota.
    await waitFor(() => expect(screen.getByTestId('aba-notas').textContent).toContain('Nota nova do popover'));
  });
});
