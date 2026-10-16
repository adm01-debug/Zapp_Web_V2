/**
 * HZ2-007 / HZ5-19 — o recolhimento da barra lateral é do USUÁRIO, não do navegador.
 *
 * Antes: chave global `zapp-sidebar-collapsed`. Agora: `zapp.sidebar.collapsed:<userId>`,
 * com migração única da chave antiga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.userId ? { id: authState.userId } : null }),
}));

import {
  useSidebarCollapse,
  sidebarCollapsedStorageKey,
} from '@/hooks/ui/useSidebarCollapse';

const LEGACY_KEY = 'zapp-sidebar-collapsed';
const U1 = 'usuario-1';
const U2 = 'usuario-2';

beforeEach(() => {
  localStorage.clear();
  authState.userId = null;
});

describe('useSidebarCollapse — isolamento por usuário', () => {
  it('dois usuários no mesmo navegador não compartilham o recolhimento', () => {
    authState.userId = U1;
    const primeiro = renderHook(() => useSidebarCollapse());

    // Sem valor gravado, o padrão da casa é recolhida.
    expect(primeiro.result.current.collapsed).toBe(true);

    act(() => {
      primeiro.result.current.toggle();
    });
    expect(primeiro.result.current.collapsed).toBe(false);
    expect(localStorage.getItem(sidebarCollapsedStorageKey(U1))).toBe('false');
    primeiro.unmount();

    authState.userId = U2;
    const segundo = renderHook(() => useSidebarCollapse());
    // O segundo usuário começa no padrão, não no valor escolhido pelo primeiro.
    expect(segundo.result.current.collapsed).toBe(true);

    act(() => {
      segundo.result.current.toggle();
    });
    expect(segundo.result.current.collapsed).toBe(false);
    expect(localStorage.getItem(sidebarCollapsedStorageKey(U2))).toBe('false');
    // O valor do primeiro continua o dele.
    expect(localStorage.getItem(sidebarCollapsedStorageKey(U1))).toBe('false');
    segundo.unmount();
  });

  it('migra a chave antiga sem dono uma única vez', () => {
    localStorage.setItem(LEGACY_KEY, 'false');

    authState.userId = U1;
    const { result } = renderHook(() => useSidebarCollapse());

    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(sidebarCollapsedStorageKey(U1))).toBe('false');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('responde ao evento toggle-sidebar', () => {
    authState.userId = U1;
    const { result } = renderHook(() => useSidebarCollapse());

    expect(result.current.collapsed).toBe(true);
    act(() => {
      document.dispatchEvent(new Event('toggle-sidebar'));
    });
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(sidebarCollapsedStorageKey(U1))).toBe('false');
  });
});
