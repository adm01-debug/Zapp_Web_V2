import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DepartmentInvitesView } from '../DepartmentInvitesView';

/**
 * F76 — o convite vive em `department_invitations` (contrato atual do hook) e
 * carrega uso e limite (`use_count`/`max_uses`). A tela só mostrava código e
 * validade: um convite de uso único já consumido aparecia como disponível.
 *
 * Renderiza o componente REAL e mocka o módulo de hooks no caminho exato que ele
 * importa, para provar que leitura/criação/revogação passam pelo contrato novo.
 */
const h = vi.hoisted(() => ({
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  loading: false,
  error: false,
  invites: [
    {
      id: 'inv-1',
      department_id: 'dep-1',
      code: 'AB12CD34',
      created_by: 'user-1',
      expires_at: '2026-10-20T12:00:00.000Z',
      created_at: '2026-10-08T12:00:00.000Z',
      status: 'pending',
      use_count: 1,
      max_uses: 3,
    },
  ],
}));

vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useDepartmentInvites: () => ({ data: h.invites, isLoading: h.loading, isError: h.error }),
  useCreateDepartmentInvite: () => ({ mutate: h.createMutate, isPending: false }),
  useDeleteDepartmentInvite: () => ({ mutate: h.deleteMutate, isPending: false }),
}));

describe('DepartmentInvitesView — convites do contrato atual (F76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.loading = false;
    h.error = false;
    h.invites = [
      {
        id: 'inv-1',
        department_id: 'dep-1',
        code: 'AB12CD34',
        created_by: 'user-1',
        expires_at: '2026-10-20T12:00:00.000Z',
        created_at: '2026-10-08T12:00:00.000Z',
        status: 'pending',
        use_count: 1,
        max_uses: 3,
      },
    ];
  });

  it('mostra uso e limite do convite', () => {
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    expect(screen.getByText('AB12CD34')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 usos')).toBeInTheDocument();
  });

  it('usa o singular quando o convite é de uso único', () => {
    h.invites[0].use_count = 0;
    h.invites[0].max_uses = 1;
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    expect(screen.getByText('0 de 1 uso')).toBeInTheDocument();
  });

  it('gera convite pela função do hook do contrato atual', () => {
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar código/ }));
    expect(h.createMutate).toHaveBeenCalledWith('Ana');
  });

  it('revoga o convite pela função do hook (admin)', () => {
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir convite' }));
    expect(h.deleteMutate).toHaveBeenCalledWith({ inviteId: 'inv-1', actorName: 'Ana' });
  });

  it('esconde as ações de admin para quem não é admin', () => {
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin={false} />);
    expect(screen.queryByRole('button', { name: /Gerar código/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir convite' })).toBeNull();
  });

  it('erro de leitura aparece como erro, não como "nenhum convite"', () => {
    h.error = true;
    h.invites = [];
    render(<DepartmentInvitesView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os convites deste departamento.');
    expect(screen.queryByText('Nenhum convite ativo')).toBeNull();
  });
});
