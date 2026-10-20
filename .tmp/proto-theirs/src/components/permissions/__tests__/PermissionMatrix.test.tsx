import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const mockUsePermissions = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/system/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock('framer-motion', () => {
  const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout']);
  return {
    motion: {
      div: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        const safe = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
        return <div {...safe}>{children}</div>;
      },
    },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { PermissionMatrix } from '../PermissionMatrix';

function setupHook(overrides: Record<string, unknown> = {}) {
  mockUsePermissions.mockReturnValue({
    permissions: [{ id: 'p1', name: 'manage_users', description: 'Gerenciar usuários', category: 'settings' }],
    rolePermissions: [{ role: 'agent', permission_id: 'p1' }],
    userPermissions: [],
    loading: false,
    hasPermission: vi.fn(() => false),
    hasAnyPermission: vi.fn(() => false),
    hasAllPermissions: vi.fn(() => false),
    checkPermissionServer: vi.fn(async () => false),
    addPermissionToRole: vi.fn(async () => true),
    removePermissionFromRole: vi.fn(async () => false),
    refetch: vi.fn(),
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function checkedAgentCheckbox() {
  const checkbox = screen
    .getAllByRole('checkbox')
    .find((el) => el.getAttribute('aria-checked') === 'true' && !el.hasAttribute('disabled'));
  expect(checkbox).toBeDefined();
  return checkbox as HTMLElement;
}

describe('PermissionMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anuncia "Permissão removida" quando a revogação retorna true', async () => {
    const removePermissionFromRole = vi.fn(async () => true);
    setupHook({ removePermissionFromRole });
    render(<PermissionMatrix />);

    fireEvent.click(checkedAgentCheckbox());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Permissão removida'));
  });

  it('não anuncia "Permissão removida" quando a revogação falha silenciosamente (retorno false)', async () => {
    const op = deferred<boolean>();
    const removePermissionFromRole = vi.fn(() => op.promise);
    setupHook({ removePermissionFromRole });
    render(<PermissionMatrix />);

    const checkbox = checkedAgentCheckbox();
    fireEvent.click(checkbox);

    await waitFor(() => expect(removePermissionFromRole).toHaveBeenCalledWith('agent', 'p1'));
    await act(async () => {
      op.resolve(false);
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it('mostra toast.error e não anuncia sucesso quando a revogação lança erro', async () => {
    const op = deferred<boolean>();
    const removePermissionFromRole = vi.fn(() => op.promise);
    setupHook({ removePermissionFromRole });
    render(<PermissionMatrix />);

    const checkbox = checkedAgentCheckbox();
    fireEvent.click(checkbox);

    await waitFor(() => expect(removePermissionFromRole).toHaveBeenCalledWith('agent', 'p1'));
    await act(async () => {
      op.reject({ message: 'new row violates row-level security policy', code: '42501' });
    });

    expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar permissão');
    expect(toast.success).not.toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });
});
