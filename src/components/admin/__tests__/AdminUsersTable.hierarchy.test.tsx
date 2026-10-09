/**
 * A11Y: Hierarquia de títulos em AdminUsersTable.
 * CardTitle renderiza h3, mas o cartão precisa de h2 (SHELL-14).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminUsersTable } from '../AdminUsersTable';

const mockUsers = [
  { id: 'u1', name: 'João', email: 'joão@test.com', role: 'admin' as const, isActive: true },
];

describe('a11y: hierarquia de títulos em AdminUsersTable', () => {
  it('Usuários está em h2 (não h3)', () => {
    render(<AdminUsersTable users={mockUsers} isAdmin onRoleChange={vi.fn()} onToggleActive={vi.fn()} onEditUser={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: /Usuários/i });
    expect(heading.tagName).toBe('H2');
  });
});