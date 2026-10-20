/**
 * Paridade V3 (E60) — papel inválido recusado na tabela de usuários.
 *
 * O defeito: `onValueChange={(v) => onRoleChange(user.user_id, v as AppRole)}`
 * mandava QUALQUER string do `<Select>` para a RPC `admin_set_role`. O teste
 * troca o Select por um dublê que entrega a string crua no `onValueChange` —
 * é o boundary de verdade — e cobra a recusa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import type { UserWithRole } from '../useAdminData';
import type { AppRole } from '@/hooks/system/useUserRole';

const { receberPapel } = vi.hoisted(() => ({
  receberPapel: { atual: null as null | ((valor: string) => void) },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children?: React.ReactNode }) => {
    receberPapel.atual = onValueChange ?? null;
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { AdminUsersTable } from '../AdminUsersTable';

const usuarios: UserWithRole[] = [
  {
    id: 'u1', user_id: 'u1', name: 'João', email: 'joao@test.com', role: 'agent' as AppRole,
    job_title: null, department: null, avatar_url: null, nickname: null, signature: null,
    phone: null, access_level: null, max_chats: null, can_download: false, is_active: true,
    created_at: '2026-01-01',
  },
];

const onRoleChange = vi.fn<(userId: string, role: AppRole) => void>();

beforeEach(() => {
  onRoleChange.mockClear();
  receberPapel.atual = null;
});

afterEach(() => cleanup());

function montar() {
  render(
    <AdminUsersTable
      users={usuarios}
      isAdmin
      onRoleChange={onRoleChange}
      onToggleActive={vi.fn()}
      onEditUser={vi.fn()}
    />,
  );
}

describe('AdminUsersTable — papel inválido não passa', () => {
  it('o boundary entrega a string do Select ao guard (não a um cast)', () => {
    montar();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(typeof receberPapel.atual).toBe('function');
  });

  it('recusa `superadmin`/`owner`/`` e não troca o papel', () => {
    montar();
    for (const invalido of ['superadmin', 'owner', '', 'admin ']) {
      act(() => receberPapel.atual!(invalido));
    }
    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it('aceita um papel da lista e repassa com o user_id', () => {
    montar();
    act(() => receberPapel.atual!('supervisor'));
    expect(onRoleChange).toHaveBeenCalledTimes(1);
    expect(onRoleChange).toHaveBeenCalledWith('u1', 'supervisor');
  });
});
