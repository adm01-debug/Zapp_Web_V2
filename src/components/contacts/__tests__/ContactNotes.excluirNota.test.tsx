import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { ContactNotes } from '../ContactNotes';

/**
 * R2-AUTH-026 (item 251) — "Excluir nota de colega some da UI mesmo quando o RLS
 * preserva a nota".
 *
 * A policy `contact_notes_delete_policy` (migration
 * 20260909200000_harden_inbox_contact_authorization.sql) só deixa apagar a nota
 * cujo `author_id = get_profile_id_for_user(auth.uid())`, enquanto o SELECT
 * libera todas as notas de um contato visível. O DELETE de nota alheia, então,
 * altera ZERO linhas e NÃO devolve erro: o PostgREST responde 204 vazio.
 *
 * O componente (ContactDetailPanel → ContactNotes, o painel de detalhe do
 * contato em ContactsView) oferecia o botão de excluir para toda nota e, sem
 * confirmar linha apagada, tirava a nota do estado e anunciava "Nota excluída".
 * A nota continuava no banco e reaparecia no reload.
 *
 * O teste renderiza o componente real, com o cliente do Supabase mockado
 * (nenhum teste fala com produção — guarda de rede em src/test/setup.ts).
 */

const h = vi.hoisted(() => ({
  myProfileId: 'profile-me' as string | null,
  notes: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  /** Linhas devolvidas pelo DELETE ... select('id') — vazio = nada foi apagado. */
  deleteRows: [] as Array<{ id: string }>,
  deleteCalls: [] as string[],
  /** Simula o banco mudando entre o DELETE e o refetch seguinte. */
  onDelete: null as (() => void) | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: h.myProfileId ? { id: h.myProfileId } : null }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = (table: string) => {
    const q: Record<string, unknown> = { _op: 'select', _filters: {} as Record<string, unknown> };
    q.select = vi.fn(() => q);
    q.delete = vi.fn(() => {
      q._op = 'delete';
      return q;
    });
    q.eq = vi.fn((col: string, val: unknown) => {
      (q._filters as Record<string, unknown>)[col] = val;
      return q;
    });
    q.order = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.insert = vi.fn(() => q);
    // A consulta é "thenable": o componente faz `await supabase.from(...)....`.
    q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let result: unknown;
      if (q._op === 'delete') {
        h.deleteCalls.push(String((q._filters as Record<string, unknown>).id));
        result = { data: h.deleteRows, error: null };
        h.onDelete?.();
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
};
const NOTA_COLEGA = {
  id: 'nota-colega',
  content: 'Nota do colega',
  created_at: '2026-10-06T11:00:00.000Z',
  author_id: 'profile-colega',
};

/** Cartão da nota na lista (o motion.div que envolve autor + conteúdo + botão). */
function cartao(texto: string): HTMLElement {
  return screen.getByText(texto).closest('.group') as HTMLElement;
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
  h.deleteRows = [];
  h.deleteCalls = [];
  h.onDelete = null;
});

describe('ContactNotes · excluir nota (R2-AUTH-026)', () => {
  it('só oferece excluir na própria nota; a nota do colega não tem a ação', async () => {
    await abrir();

    const meuCartao = cartao('Minha nota');
    const cartaoDoColega = cartao('Nota do colega');

    // Capacidade vem do autor real da nota (mesmo dado que a policy usa).
    expect(within(cartaoDoColega).queryAllByRole('button')).toHaveLength(0);
    expect(within(meuCartao).queryAllByRole('button')).toHaveLength(1);
    expect(within(meuCartao).getByRole('button')).toHaveAttribute('aria-label', 'Excluir nota');
  });

  it('não oferece excluir enquanto o autor logado ainda não é conhecido', async () => {
    h.myProfileId = null;
    await abrir();

    expect(within(cartao('Minha nota')).queryAllByRole('button')).toHaveLength(0);
    expect(within(cartao('Nota do colega')).queryAllByRole('button')).toHaveLength(0);
  });

  it('nota própria: confirma a linha apagada antes de tirar da lista e anuncia sucesso', async () => {
    h.deleteRows = [{ id: 'nota-minha' }];
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button'));

    await waitFor(() => expect(screen.queryByText('Minha nota')).not.toBeInTheDocument());
    expect(h.deleteCalls).toEqual(['nota-minha']);
    expect(toastSuccess).toHaveBeenCalledWith('Nota excluída');
    expect(toastError).not.toHaveBeenCalled();
    // A nota do colega continua na lista.
    expect(screen.getByText('Nota do colega')).toBeInTheDocument();
  });

  it('DELETE sem linha apagada (RLS preserva a nota): a nota NÃO some da tela e o erro é explícito', async () => {
    // RLS filtra a linha: o DELETE volta sem erro e sem representação.
    h.deleteRows = [];
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    // Nada do que a tela exibia pode sumir: a nota segue no banco e na lista.
    expect(screen.getByText('Minha nota')).toBeInTheDocument();
    expect(screen.getByText('Nota do colega')).toBeInTheDocument();
  });

  it('nota que já não existe: sai da lista pela releitura do banco, não por conta própria, e o erro é anunciado', async () => {
    h.deleteRows = [];
    // Entre o clique e a releitura a nota some do banco (excluída em outra sessão).
    h.onDelete = () => {
      h.notes = [NOTA_COLEGA];
    };
    await abrir();

    fireEvent.click(within(cartao('Minha nota')).getByRole('button'));

    await waitFor(() => expect(screen.queryByText('Minha nota')).not.toBeInTheDocument());
    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('Nota do colega')).toBeInTheDocument();
  });
});
