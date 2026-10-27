import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ContactNotes } from '../ContactNotes';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Compatibilidade de deploy (C098): o front vai ao ar antes da migration que cria
 * `contact_notes.is_pinned`. Aqui a prova é a TELA nos dois estados do banco:
 *  - SEM a coluna (linhas sem a chave): lista, criar, editar e excluir funcionam como
 *    antes e NENHUM controle de fixar aparece; o INSERT não leva `is_pinned`.
 *  - COM a coluna (linhas com `is_pinned` booleano): os controles aparecem e fixar ordena.
 */
const h = vi.hoisted(() => ({
  notes: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-me' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = (table: string) => {
    const f: Record<string, unknown> = {};
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let patch: Record<string, unknown> = {};
    let single = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      in: () => q,
      order: () => q,
      range: () => q,
      eq: (c: string, v: unknown) => { f[c] = v; return q; },
      single: () => { single = true; return q; },
      insert: (p: Record<string, unknown>) => { op = 'insert'; h.inserts.push(p); return q; },
      update: (p: Record<string, unknown>) => { op = 'update'; patch = p; return q; },
      delete: () => { op = 'delete'; return q; },
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
        let result: unknown;
        if (table === 'profiles') {
          result = { data: single ? { id: 'profile-me' } : [{ id: 'profile-me', name: 'Íris' }], error: null };
        } else if (op === 'insert') {
          result = { data: null, error: null };
        } else if (op === 'update') {
          const id = String(f.id);
          h.updates.push({ id, patch });
          h.notes = h.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
          result = { data: h.notes.find((n) => n.id === id) ?? null, error: null };
        } else if (op === 'delete') {
          const id = String(f.id);
          const row = h.notes.find((n) => n.id === id);
          h.notes = h.notes.filter((n) => n.id !== id);
          result = { data: row ? [{ id }] : [], error: null };
        } else {
          // Ordem do servidor: created_at desc.
          result = { data: [...h.notes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), error: null };
        }
        return Promise.resolve(result).then(ok, err);
      },
    };
    return q;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => buildQuery(t)),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'auth-me' } } })) },
    },
  };
});

const base = (id: string, content: string, created_at: string) => ({
  id, content, created_at, contact_id: 'c1', author_id: 'profile-me',
  category: 'note', is_done: false, due_date: null, updated_at: created_at,
});

const SEM_COLUNA = () => [
  base('n-novo', 'Nota nova', '2026-10-06T12:00:00.000Z'),
  base('n-velho', 'Nota velha', '2026-10-06T11:00:00.000Z'),
];
const COM_COLUNA = () => [
  { ...base('n-novo', 'Nota nova', '2026-10-06T12:00:00.000Z'), is_pinned: false },
  { ...base('n-velho', 'Nota velha', '2026-10-06T11:00:00.000Z'), is_pinned: false },
];

const cartao = (t: string) => screen.getByText(t).closest('.group') as HTMLElement;
const ordem = () => Array.from(document.querySelectorAll<HTMLElement>('.group')).map((e) => e.textContent ?? '');

async function abrir() {
  render(<ContactNotes contactId="c1" />, { wrapper: TestQueryWrapper });
  await screen.findByText('Nota nova');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts = [];
  h.updates = [];
});

describe('ContactNotes · coluna is_pinned AUSENTE (antes da migration)', () => {
  beforeEach(() => { h.notes = SEM_COLUNA(); });

  it('renderiza a lista, sem botão de fixar/desafixar nem selo "Fixada"', async () => {
    await abrir();

    expect(screen.getByText('Nota velha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fixar nota' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desafixar nota' })).toBeNull();
    expect(screen.queryByText('Fixada')).toBeNull();
    // Editar e excluir seguem disponíveis (independem da coluna).
    const c = cartao('Nota nova');
    expect(within(c).getByRole('button', { name: 'Editar nota' })).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Excluir nota' })).toBeInTheDocument();
    // Ordem de sempre: mais recente primeiro.
    expect(ordem()[0]).toContain('Nota nova');
  });

  it('criar nota NÃO envia is_pinned no insert', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nova nota' }), { target: { value: 'Outra nota' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(h.inserts).toHaveLength(1));
    expect(h.inserts[0]).toEqual({ contact_id: 'c1', author_id: 'profile-me', content: 'Outra nota' });
    expect(h.inserts[0]).not.toHaveProperty('is_pinned');
  });

  it('editar o texto grava só o conteúdo e a tela continua sem controles de fixar', async () => {
    await abrir();

    fireEvent.click(within(cartao('Nota nova')).getByRole('button', { name: 'Editar nota' }));
    const editor = screen.getByRole('textbox', { name: 'Editar nota' });
    fireEvent.change(editor, { target: { value: 'Texto editado' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(screen.getByText('Texto editado')).toBeInTheDocument());
    expect(h.updates).toEqual([{ id: 'n-novo', patch: { content: 'Texto editado' } }]);
    expect(screen.queryByRole('button', { name: 'Fixar nota' })).toBeNull();
  });

  it('excluir a própria nota continua funcionando', async () => {
    await abrir();

    fireEvent.click(within(cartao('Nota velha')).getByRole('button', { name: 'Excluir nota' }));

    await waitFor(() => expect(screen.queryByText('Nota velha')).toBeNull());
    expect(screen.getByText('Nota nova')).toBeInTheDocument();
  });
});

describe('ContactNotes · coluna is_pinned PRESENTE (depois da migration)', () => {
  beforeEach(() => { h.notes = COM_COLUNA(); });

  it('os controles de fixar aparecem na própria nota', async () => {
    await abrir();
    expect(within(cartao('Nota nova')).getByRole('button', { name: 'Fixar nota' })).toBeInTheDocument();
    expect(within(cartao('Nota velha')).getByRole('button', { name: 'Fixar nota' })).toBeInTheDocument();
  });

  it('fixar grava is_pinned e sobe a nota para o topo; desafixar volta à ordem cronológica', async () => {
    await abrir();
    expect(ordem()[0]).toContain('Nota nova');

    fireEvent.click(within(cartao('Nota velha')).getByRole('button', { name: 'Fixar nota' }));
    await waitFor(() => expect(h.updates).toEqual([{ id: 'n-velho', patch: { is_pinned: true } }]));

    await waitFor(() => expect(ordem()[0]).toContain('Nota velha'));
    const topo = document.querySelector<HTMLElement>('.group') as HTMLElement;
    expect(topo).toHaveAttribute('data-pinned', 'true');
    expect(within(topo).getByText('Fixada')).toBeInTheDocument();

    fireEvent.click(within(topo).getByRole('button', { name: 'Desafixar nota' }));
    await waitFor(() => expect(h.updates[1]).toEqual({ id: 'n-velho', patch: { is_pinned: false } }));
    await waitFor(() => expect(ordem()[0]).toContain('Nota nova'));
  });
});
