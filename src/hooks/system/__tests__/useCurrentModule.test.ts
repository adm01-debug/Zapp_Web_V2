import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// O dublê é só o DADO dos menus (fronteira), com ids ímpares por grupo.
const { ICON_PRIMARY, ICON_CHAT } = vi.hoisted(() => ({
  ICON_PRIMARY: { nome: 'icone-inbox' },
  ICON_CHAT: { nome: 'icone-chat' },
}));

vi.mock('@/components/layout/sidebarNavConfig', () => ({
  primaryNav: [{ id: 'inbox', label: 'Inbox', icon: ICON_PRIMARY }],
  communicationNav: [{ id: 'chat', label: 'Conversas', icon: ICON_CHAT }],
  automationNav: [],
  salesNav: [],
  connectionsNav: [],
  analyticsNav: [],
  systemNav: [],
  inDevelopmentNav: [],
}));

import { useCurrentModule } from '../useCurrentModule';

describe('useCurrentModule', () => {
  it('devolve id, rótulo e ícone do item do grupo sem título (grupo = null)', () => {
    const { result } = renderHook(() => useCurrentModule('inbox'));
    expect(result.current).toEqual({ id: 'inbox', label: 'Inbox', icon: ICON_PRIMARY, group: null });
  });

  it('devolve o título do grupo quando o item está num grupo nomeado', () => {
    const { result } = renderHook(() => useCurrentModule('chat'));
    expect(result.current).toEqual({ id: 'chat', label: 'Conversas', icon: ICON_CHAT, group: 'Comunicação' });
  });

  it('cai no espelho do id quando o módulo não existe no menu', () => {
    const { result } = renderHook(() => useCurrentModule('modulo-inexistente'));
    expect(result.current).toEqual({ id: 'modulo-inexistente', label: 'modulo-inexistente', icon: null, group: null });
  });
});
