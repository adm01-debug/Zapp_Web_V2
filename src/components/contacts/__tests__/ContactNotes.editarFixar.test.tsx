import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { ContactNotes } from '../ContactNotes';

/**
 * CT-B (paridade V3 -> V2) — a ficha do contato (ContactDetailPanel → ContactNotes)
 * não tinha tela para editar o texto nem fixar a nota. Aqui a prova é a TELA real,
 * com o cliente do Supabase mockado (nenhum teste fala com produção — guarda de rede
 * em src/test/setup.ts).
 *
 * A policy `contact_notes_update_policy` (migration
 * 20260909200000_harden_inbox_contact_authorization.sql) só alcança a nota cujo
 * `author_id = get_profile_id_for_user(auth.uid())`: editar/fixar nota de colega
 * altera ZERO linhas e o PostgREST responde 204 vazio. Por isso o componente pede
 * a linha de volta (`select('id')`) antes de mexer na tela.
 */

const h = vi.hoisted(() => ({
  myProfileId: 'profile-me' as string | null,
  notes: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  /** Linhas devolvidas pelo UPDATE ... select('id') — vazio = nada foi alterado. */
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
    };
    q.select = vi.fn(() => q);
    q.insert = vi.fn(() => q);
    q.eq = vi.fn((col: string, val: unknown) => {
      (q._filters as Record<string, unknown>)[col] = val;
      return q;
    });
    q.in = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.single = vi.fn(() => q);
    q.update = vi.fn((patch: Record<string, unknown>) => {
      q._op = 'update';
      q._patch = patch;
      return q;
    });
    // A consulta é "thenable": o componente faz `await supabase.from(...)....`.
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let result: unknown;
      if (q._op === 'update') {
        h.updateCalls.push({ id: String((q._filters as Record<string, unknown>).id), patch: q._patch as Record<string, unknown> });
        result = { data: h.updateRows, error: null };
      } else if (table === 'contact_notes') {
        result = { data: h.notes, error: null };
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

const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

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
  render(<ContactNotes contactId="contato-1" />);
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
  h.updateRows = [{ id: 'x' }];
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

  it('UPDATE sem linha alterada (RLS preserva a nota do colega): não muda o texto e o erro é explícito', async () => {
    h.updateRows = [];
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button', { name: 'Editar nota' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar nota' }), { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
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
