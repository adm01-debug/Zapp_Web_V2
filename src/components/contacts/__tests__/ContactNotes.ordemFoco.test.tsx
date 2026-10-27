import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ContactNotes } from '../ContactNotes';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Refazer 1 do cartão de editar/fixar nota (ficha do contato): a recusa apontou
 * três defeitos que o próprio diff mostrava — a lista buscava as 20 mais
 * recentes e só depois punha as fixadas no topo (fixada antiga sumia), o foco
 * só era tratado ao abrir o editor (ao fechar caía no body) e o orderNotes do
 * componente não tinha o desempate final por `id` desc do hook.
 *
 * O mock abaixo HONRA `.order()` + `.limit()` como o PostgREST: ordena a cópia
 * das notas pelas cláusulas registradas e só então corta no limite. Sem isso o
 * teste do ponto 1 passaria antes e depois (o cliente reordenava tudo).
 */

const h = vi.hoisted(() => ({
  myProfileId: 'profile-me' as string | null,
  notes: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  updateRows: [{ id: 'x' }] as Array<{ id: string }>,
  updateCalls: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: h.myProfileId ? { id: h.myProfileId } : null }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = (table: string) => {
    const q: Record<string, unknown> = {
      _op: 'select',
      _table: table,
      _filters: {} as Record<string, unknown>,
      _patch: null as Record<string, unknown> | null,
      _orders: [] as Array<{ col: string; asc: boolean }>,
      _limit: null as number | null,
    };
    q.select = vi.fn(() => q);
    q.insert = vi.fn(() => q);
    q.eq = vi.fn((col: string, val: unknown) => {
      (q._filters as Record<string, unknown>)[col] = val;
      return q;
    });
    q.in = vi.fn(() => q);
    // PostgREST: ordena primeiro, corta no limite depois.
    q.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      (q._orders as Array<{ col: string; asc: boolean }>).push({ col, asc: opts?.ascending ?? true });
      return q;
    });
    q.limit = vi.fn((n: number) => {
      q._limit = n;
      return q;
    });
    q.single = vi.fn(() => q);
    q.update = vi.fn((patch: Record<string, unknown>) => {
      q._op = 'update';
      q._patch = patch;
      return q;
    });
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let result: unknown;
      if (q._op === 'update') {
        h.updateCalls.push({ id: String((q._filters as Record<string, unknown>).id), patch: q._patch as Record<string, unknown> });
        result = { data: h.updateRows, error: null };
      } else if (table === 'contact_notes') {
        const orders = q._orders as Array<{ col: string; asc: boolean }>;
        const val = (row: Record<string, unknown>, col: string): number | string =>
          col === 'is_pinned' ? Number(row[col] === true) : String(row[col] ?? '');
        const rows = [...h.notes].sort((a, b) => {
          for (const { col, asc } of orders) {
            const va = val(a, col);
            const vb = val(b, col);
            if (va !== vb) return (va < vb ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        result = { data: q._limit != null ? rows.slice(0, q._limit as number) : rows, error: null };
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
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'auth-me' } } })) },
    },
  };
});

function cartao(texto: string): HTMLElement {
  return screen.getByText(texto).closest('.group') as HTMLElement;
}

function botaoEditarDoCartao(texto: string): HTMLElement {
  return within(cartao(texto)).getByRole('button', { name: 'Editar nota' });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.myProfileId = 'profile-me';
  h.profiles = [{ id: 'profile-me', name: 'Eu' }];
  h.updateRows = [{ id: 'x' }];
  h.updateCalls = [];
});

describe('ContactNotes · refazer 1: fixada antiga, foco gerenciado e desempate por id', () => {
  it('fixada mais antiga que as 20 recentes segue visível no topo (ordem no servidor antes do limite)', async () => {
    // 21 recentes (12:00–12:20) + 1 fixada de setembro: 22 notas no banco.
    h.notes = Array.from({ length: 21 }, (_, i) => ({
      id: `nota-recente-${String(i).padStart(2, '0')}`,
      content: `Recente ${i}`,
      created_at: new Date(Date.UTC(2026, 9, 6, 12, i)).toISOString(),
      author_id: 'profile-me',
      is_pinned: false,
    }));
    h.notes.push({
      id: 'nota-fixada-antiga',
      content: 'Nota fixada antiga',
      created_at: '2026-09-01T10:00:00.000Z',
      author_id: 'profile-me',
      is_pinned: true,
    });

    render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
    await screen.findByText('Nota fixada antiga');

    const primeiro = document.querySelectorAll<HTMLElement>('.group')[0];
    expect(primeiro.textContent).toContain('Nota fixada antiga');
    expect(primeiro).toHaveAttribute('data-pinned', 'true');
  });

  it('empate de created_at rende ordem determinística por id desc (servidor + orderNotes)', async () => {
    // Mesmo instante nas duas: sem desempate por id, a ordem herdada da
    // inserção ([A, B]) vazava para a tela e trocava a cada render.
    const instante = '2026-10-06T12:00:00.000Z';
    h.notes = [
      {
        id: 'nota-a', content: 'Texto A', created_at: instante,
        author_id: 'profile-me', is_pinned: false,
      },
      {
        id: 'nota-b', content: 'Texto B', created_at: instante,
        author_id: 'profile-me', is_pinned: false,
      },
    ];

    render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
    await screen.findByText('Texto A');

    const cards = Array.from(document.querySelectorAll<HTMLElement>('.group'));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Texto B');
    expect(cards[1].textContent).toContain('Texto A');
  });

  it('salvar devolve o foco ao Editar nota da mesma nota', async () => {
    h.notes = [{
      id: 'nota-minha', content: 'Minha nota', created_at: '2026-10-06T12:00:00.000Z',
      author_id: 'profile-me', is_pinned: false,
    }];
    render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
    await screen.findByText('Minha nota');

    fireEvent.click(botaoEditarDoCartao('Minha nota'));
    const editor = screen.getByRole('textbox', { name: 'Editar nota' });
    fireEvent.change(editor, { target: { value: 'Texto editado' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(screen.getByText('Texto editado')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull());
    expect(document.activeElement).toBe(botaoEditarDoCartao('Texto editado'));
  });

  it('esc sem alteração fecha e devolve o foco ao Editar nota', async () => {
    h.notes = [{
      id: 'nota-minha', content: 'Minha nota', created_at: '2026-10-06T12:00:00.000Z',
      author_id: 'profile-me', is_pinned: false,
    }];
    render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
    await screen.findByText('Minha nota');

    fireEvent.click(botaoEditarDoCartao('Minha nota'));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar nota' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull();
    expect(document.activeElement).toBe(botaoEditarDoCartao('Minha nota'));
  });

  it('esc com alteração foca Continuar editando; continuar volta à textarea; descartar volta ao Editar', async () => {
    h.notes = [{
      id: 'nota-minha', content: 'Minha nota', created_at: '2026-10-06T12:00:00.000Z',
      author_id: 'profile-me', is_pinned: false,
    }];
    render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
    await screen.findByText('Minha nota');

    fireEvent.click(botaoEditarDoCartao('Minha nota'));
    const editor = screen.getByRole('textbox', { name: 'Editar nota' });
    fireEvent.change(editor, { target: { value: 'rascunho' } });
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(screen.getByText('Descartar as alterações não salvas?')).toBeInTheDocument();
    const continuar = screen.getByRole('button', { name: 'Continuar editando' });
    expect(document.activeElement).toBe(continuar);

    fireEvent.click(continuar);
    expect(screen.queryByText('Descartar as alterações não salvas?')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Editar nota' }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar nota' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull();
    expect(screen.getByText('Minha nota')).toBeInTheDocument();
    expect(document.activeElement).toBe(botaoEditarDoCartao('Minha nota'));
    expect(h.updateCalls).toHaveLength(0);
  });
});
