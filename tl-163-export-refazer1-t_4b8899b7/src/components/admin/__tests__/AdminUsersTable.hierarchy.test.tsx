/**
 * A11Y: Hierarquia de títulos em AdminUsersTable.
 * CardTitle renderiza h3, mas o cartão precisa de h2 (SHELL-14).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminUsersTable } from '../AdminUsersTable';
import type { UserWithRole } from '../useAdminData';
import type { AppRole } from '@/hooks/system/useUserRole';

const mockUsers: UserWithRole[] = [
  { id: 'u1', user_id: 'u1', name: 'João', email: 'joão@test.com', role: 'admin' as AppRole, job_title: null, department: null, avatar_url: null, nickname: null, signature: null, phone: null, access_level: null, max_chats: null, can_download: false, is_active: true, created_at: '2026-01-01' },
];

describe('a11y: hierarquia de títulos em AdminUsersTable', () => {
  it('Usuários está em h2 (não h3)', () => {
    render(<AdminUsersTable users={mockUsers} isAdmin onRoleChange={vi.fn()} onToggleActive={vi.fn()} onEditUser={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: /Usuários/i });
    expect(heading.tagName).toBe('H2');
  });
});