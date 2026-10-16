/**
 * HZ2-007 / HZ5-19 — os favoritos da barra lateral são do USUÁRIO, não do navegador.
 *
 * Antes: chave global `sidebar-favorites` — duas contas no mesmo computador viam os
 * mesmos atalhos. Agora: `zapp.sidebar.favorites:<userId>` (convenção da casa
 * `zapp.<area>:<dono>`), com migração única da chave antiga e sem apagar o que é do
 * usuário no logout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.userId ? { id: authState.userId } : null }),
}));

import {
  useSidebarFavorites,
  sidebarFavoritesStorageKey,
} from '@/hooks/ui/useSidebarFavorites';

const LEGACY_KEY = 'sidebar-favorites';
const U1 = 'usuario-1';
const U2 = 'usuario-2';

beforeEach(() => {
  localStorage.clear();
  authState.userId = null;
});

describe('useSidebarFavorites — isolamento por usuário', () => {
  it('dois usuários no mesmo navegador têm conjuntos distintos', () => {
    authState.userId = U1;
    const primeiro = renderHook(() => useSidebarFavorites());

    act(() => {
      primeiro.result.current.toggleFavorite('chatbot');
      primeiro.result.current.toggleFavorite('inbox');
    });

    expect(primeiro.result.current.favorites).toEqual(['chatbot', 'inbox']);
    expect(JSON.parse(localStorage.getItem(sidebarFavoritesStorageKey(U1)) ?? 'null')).toEqual([
      'chatbot',
      'inbox',
    ]);
    primeiro.unmount();

    authState.userId = U2;
    const segundo = renderHook(() => useSidebarFavorites());

    // O segundo usuário NÃO herda os favoritos do primeiro.
    expect(segundo.result.current.favorites).toEqual([]);

    act(() => {
      segundo.result.current.toggleFavorite('tarefas');
    });

    expect(segundo.result.current.favorites).toEqual(['tarefas']);
    expect(JSON.parse(localStorage.getItem(sidebarFavoritesStorageKey(U2)) ?? 'null')).toEqual([
      'tarefas',
    ]);
    // E o conjunto do primeiro continua intacto.
    expect(JSON.parse(localStorage.getItem(sidebarFavoritesStorageKey(U1)) ?? 'null')).toEqual([
      'chatbot',
      'inbox',
    ]);
    segundo.unmount();

    // Voltar para o primeiro usuário devolve o conjunto dele.
    authState.userId = U1;
    const deVolta = renderHook(() => useSidebarFavorites());
    expect(deVolta.result.current.favorites).toEqual(['chatbot', 'inbox']);
  });

  it('migra a chave antiga sem dono uma única vez', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(['chatbot']));

    authState.userId = U1;
    const primeira = renderHook(() => useSidebarFavorites());

    expect(primeira.result.current.favorites).toEqual(['chatbot']);
    // O valor antigo passou a ser do usuário...
    expect(JSON.parse(localStorage.getItem(sidebarFavoritesStorageKey(U1)) ?? 'null')).toEqual([
      'chatbot',
    ]);
    // ...e a chave global foi consumida (migração única).
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    primeira.unmount();

    // Outro usuário no mesmo navegador NÃO recebe o que já foi migrado.
    authState.userId = U2;
    const outra = renderHook(() => useSidebarFavorites());
    expect(outra.result.current.favorites).toEqual([]);
  });

  it('o logout não apaga os favoritos do usuário', () => {
    authState.userId = U1;
    const logado = renderHook(() => useSidebarFavorites());

    act(() => {
      logado.result.current.toggleFavorite('chatbot');
    });

    // Logout: sem usuário, nada é exibido nem gravado...
    authState.userId = null;
    const deslogado = renderHook(() => useSidebarFavorites());
    expect(deslogado.result.current.favorites).toEqual([]);

    act(() => {
      deslogado.result.current.toggleFavorite('tarefas');
    });
    expect(localStorage.getItem(sidebarFavoritesStorageKey(U1))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(sidebarFavoritesStorageKey(U1)) ?? 'null')).toEqual([
      'chatbot',
    ]);

    // ...e o novo login do mesmo usuário encontra o conjunto dele.
    authState.userId = U1;
    const relogado = renderHook(() => useSidebarFavorites());
    expect(relogado.result.current.favorites).toEqual(['chatbot']);
  });

  it('mantém o teto de seis favoritos', () => {
    authState.userId = U1;
    const { result } = renderHook(() => useSidebarFavorites());

    act(() => {
      ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => result.current.toggleFavorite(id));
    });
    expect(result.current.favorites).toHaveLength(6);
    expect(result.current.maxReached).toBe(true);

    act(() => {
      result.current.toggleFavorite('g');
    });
    expect(result.current.favorites).toHaveLength(6);
    expect(result.current.favorites).not.toContain('g');
  });
});
