import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { ContactNotes } from '../ContactNotes';
import { TestQueryWrapper } from '@/test/mocks/queryClient';
import { toast as toastHook } from '@/hooks/ui/use-toast';

/**
 * CT-B (paridade V3 -> V2) — a ficha do contato (ContactDetailPanel → ContactNotes)
 * não tinha tela para editar o texto nem fixar a nota. Aqui a prova é a TELA real,
 * com o cliente do Supabase mockado (nenhum teste fala com produção — guarda de rede
 * em src/test/setup.ts).
 *
 * A policy `contact_notes_update_policy` (migration
 * 20260909200000_harden_inbox_contact_authorization.sql) só alcança a nota cujo
 * `author_id = get_profile_id_for_user(auth.uid())`: editar/fixar nota de colega
 * altera ZERO linhas. A tela grava pelo `useContactNotes` (`editNote`/`togglePin` →
 * `ContactService.updateNote`, que pede a linha de volta com `.select().single()`): sem linha
 * alterada o PostgREST devolve PGRST116, a mutação falha e o toast de erro é do hook.
 */

const h = vi.hoisted(() => ({
  myProfileId: 'profile-me' as string | null,
  notes: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  /** false = RLS não alcança a nota: o UPDATE altera zero linhas. */
  updateAllowed: true,
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
      _range: null as [number, number] | null,
    };
    q.select = vi.fn(() => q);
    q.insert = vi.fn(() => q);
    q.eq = vi.fn((col: string, val: unknown) => {
      (q._filters as Record<string, unknown>)[col] = val;
      return q;
    });
    q.in = vi.fn(() => q);
    q.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      (q._orders as Array<{ col: string; asc: boolean }>).push({ col, asc: opts?.ascending ?? true });
      return q;
    });
    q.range = vi.fn((from: number, to: number) => {
      q._range = [from, to];
      return q;
    });
    q.single = vi.fn(() => q);
    q.update = vi.fn((patch: Record<string, unknown>) => {
      q._op = 'update';
      q._patch = patch;
      return q;
    });
    // A consulta é "thenable": o serviço faz `await supabase.from(...)....`.
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let result: unknown;
      if (q._op === 'update') {
        const id = String((q._filters as Record<string, unknown>).id);
        h.updateCalls.push({ id, patch: q._patch as Record<string, unknown> });
        const row = h.notes.find((n) => n.id === id);
        if (h.updateAllowed && row) {
          // Não muta o objeto original (as constantes dos testes são compartilhadas).
          const atualizada = { ...row, ...(q._patch as Record<string, unknown>) };
          h.notes = h.notes.map((n) => (n.id === id ? atualizada : n));
          result = { data: atualizada, error: null };
        } else {
          // RLS: UPDATE em nota de outro autor altera ZERO linhas; `.single()` vira PGRST116.
          result = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
        }
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
        const range = q._range as [number, number] | null;
        result = { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
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

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

const toastSuccess = vi.mocked(toast.success);
const toastErroDoHook = vi.mocked(toastHook);

const NOTA_MINHA = {
  id: 'nota-minha',
  content: 'Minha nota',
  created_at: '2026-10-06T12:00:00.000Z',
  author_id: 'profile-me',
  is_pinned: false,
};
const NOTA_ANTIGA_MINHA = {
  id: 'nota-antiga',
  content: 'Nota antiga',
  created_at: '2026-10-06T11:00:00.000Z',
  author_id: 'profile-me',
  is_pinned: false,
};
const NOTA_COLEGA = {
  id: 'nota-colega',
  content: 'Nota do colega',
  created_at: '2026-10-06T10:00:00.000Z',
  author_id: 'profile-colega',
  is_pinned: false,
};

/** Cartão da nota na lista (o motion.div que envolve autor + conteúdo + ações). */
function cartao(texto: string): HTMLElement {
  return screen.getByText(texto).closest('.group') as HTMLElement;
}

function cartoesEmOrdem(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.group'));
}

async function abrir() {
  render(<ContactNotes contactId="contato-1" />, { wrapper: TestQueryWrapper });
  await screen.findByText('Minha nota');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.myProfileId = 'profile-me';
  h.notes = [NOTA_MINHA, NOTA_COLEGA];
  h.profiles = [
    { id: 'profile-me', name: 'Íris' },
    { id: 'profile-colega', name: 'Colega' },
  ];
  h.updateAllowed = true;
  h.updateCalls = [];
});

describe('ContactNotes · editar e fixar (ficha do contato)', () => {
  it('só a própria nota oferece editar e fixar; a do colega não tem as ações', async () => {
    await abrir();

    const meu = cartao('Minha nota');
    expect(within(meu).getByRole('button', { name: 'Editar nota' })).toBeInTheDocument();
    expect(within(meu).getByRole('button', { name: 'Fixar nota' })).toBeInTheDocument();

    const doColega = cartao('Nota do colega');
    expect(within(doColega).queryByRole('button', { name: 'Editar nota' })).toBeNull();
    expect(within(doColega).queryByRole('button', { name: 'Fixar nota' })).toBeNull();
    expect(within(doColega).queryByRole('button', { name: 'Desafixar nota' })).toBeNull();
  });

  it('não oferece editar/fixar enquanto o autor logado ainda não é conhecido', async () => {
    h.myProfileId = null;
    await abrir();

    expect(within(cartao('Minha nota')).queryByRole('button', { name: 'Editar nota' })).toBeNull();
    expect(within(cartao('Nota do colega')).queryByRole('button', { name: 'Editar nota' })).toBeNull();
  });

  it('ctrl+enter salva o texto editado na própria nota', async () => {
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Editar nota' }));
    const editor = screen.getByRole('textbox', { name: 'Editar nota' });
    fireEvent.change(editor, { target: { value: 'Texto editado' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(screen.getByText('Texto editado')).toBeInTheDocument());
    expect(h.updateCalls).toEqual([{ id: 'nota-minha', patch: { content: 'Texto editado' } }]);
    expect(toastSuccess).toHaveBeenCalledWith('Nota atualizada');
    // O editor fecha depois da gravação confirmada.
    expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull();
  });

  it('esc sem alteração fecha a edição direto, sem gravar', async () => {
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Editar nota' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar nota' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull();
    expect(screen.getByText('Minha nota')).toBeInTheDocument();
    expect(h.updateCalls).toHaveLength(0);
  });

  it('esc com alteração não salva pede confirmação antes de descartar', async () => {
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Editar nota' }));
    const editor = screen.getByRole('textbox', { name: 'Editar nota' });
    fireEvent.change(editor, { target: { value: 'rascunho' } });
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(screen.getByText('Descartar as alterações não salvas?')).toBeInTheDocument();

    // "Continuar editando" mantém o rascunho e nada é gravado.
    fireEvent.click(screen.getByText('Continuar editando'));
    expect(screen.getByRole('textbox', { name: 'Editar nota' })).toHaveValue('rascunho');
    expect(h.updateCalls).toHaveLength(0);

    // "Descartar" abandona a edição sem gravar e o texto original segue na lista.
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar nota' }), { key: 'Escape' });
    fireEvent.click(screen.getByText('Descartar'));
    expect(screen.queryByRole('textbox', { name: 'Editar nota' })).toBeNull();
    expect(screen.getByText('Minha nota')).toBeInTheDocument();
    expect(h.updateCalls).toHaveLength(0);
  });

  it('fixar grava is_pinned, marca aria-pressed, destaca e sobe a nota para o topo', async () => {
    h.notes = [NOTA_MINHA, NOTA_ANTIGA_MINHA];
    await abrir();

    // Sem fixar: a mais recente (12:00) vem primeiro.
    expect(cartoesEmOrdem()[0].textContent).toContain('Minha nota');

    fireEvent.click(within(cartao('Nota antiga')).getByRole('button', { name: 'Fixar nota' }));

    await waitFor(() => expect(h.updateCalls).toEqual([{ id: 'nota-antiga', patch: { is_pinned: true } }]));

    const primeiro = cartoesEmOrdem()[0];
    expect(primeiro.textContent).toContain('Nota antiga');
    expect(primeiro).toHaveAttribute('data-pinned', 'true');
    expect(within(primeiro).getByText('Fixada')).toBeInTheDocument();
    expect(within(primeiro).getByRole('button', { name: 'Desafixar nota' })).toHaveAttribute('aria-pressed', 'true');
    expect(toastSuccess).toHaveBeenCalledWith('Nota fixada');
  });

  it('desafixar grava is_pinned=false e tira o destaque', async () => {
    h.notes = [{ ...NOTA_MINHA, is_pinned: true }];
    await abrir();

    expect(cartoesEmOrdem()[0]).toHaveAttribute('data-pinned', 'true');
    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Desafixar nota' }));

    await waitFor(() => expect(h.updateCalls).toEqual([{ id: 'nota-minha', patch: { is_pinned: false } }]));
    await waitFor(() => expect(cartoesEmOrdem()[0]).not.toHaveAttribute('data-pinned'));
    expect(within(cartao('Minha nota')).getByRole('button', { name: 'Fixar nota' })).toHaveAttribute('aria-pressed', 'false');
    expect(toastSuccess).toHaveBeenCalledWith('Nota desafixada');
  });

  it('UPDATE sem linha alterada (RLS preserva a nota): não muda o texto e o erro é explícito', async () => {
    h.updateAllowed = false;
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Editar nota' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar nota' }), { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toastErroDoHook).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao atualizar nota', variant: 'destructive' })));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(h.updateCalls).toEqual([{ id: 'nota-minha', patch: { content: 'Texto novo' } }]);
    // Nada mudou no estado: o editor segue aberto com o rascunho para o autor
    // tentar de novo, e ao descartar o texto original volta para a lista.
    expect(screen.getByRole('textbox', { name: 'Editar nota' })).toHaveValue('Texto novo');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar nota' }), { key: 'Escape' });
    fireEvent.click(screen.getByText('Descartar'));
    expect(screen.getByText('Minha nota')).toBeInTheDocument();
  });
});
