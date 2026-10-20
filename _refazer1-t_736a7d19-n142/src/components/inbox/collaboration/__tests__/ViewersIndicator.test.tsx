import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act, cleanup } from '@testing-library/react';

const sb = vi.hoisted(() => ({
  presenceState: {} as Record<string, unknown[]>,
  syncHandlers: [] as Array<() => void>,
  track: vi.fn(),
  removed: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = (_event: string, _filter: unknown, cb: () => void) => { sb.syncHandlers.push(cb); return ch; };
    ch.subscribe = () => ch;
    ch.presenceState = () => sb.presenceState;
    ch.track = sb.track;
    return ch;
  };
  return {
    supabase: {
      channel,
      removeChannel: sb.removed,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { ViewersIndicator, useConversationViewers } from '../ViewersIndicator';

function sync() {
  act(() => { sb.syncHandlers.forEach((h) => h()); });
}

beforeEach(() => {
  sb.presenceState = {};
  sb.syncHandlers = [];
  sb.track.mockReset().mockResolvedValue(undefined);
  sb.removed.mockReset();
  cleanup();
});

describe('useConversationViewers', () => {
  it('começa sem ninguém visualizando', () => {
    const { result } = renderHook(() => useConversationViewers('c1'));
    expect(result.current).toEqual([]);
  });

  it('lista quem está presente, ignorando o próprio usuário', () => {
    const { result } = renderHook(() => useConversationViewers('c1'));
    sb.presenceState = {
      me: [{ name: 'Eu mesmo' }],
      ana: [{ name: 'Ana', avatar_url: 'https://x/a.png', is_typing: true }],
    };
    sync();

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      id: 'ana', name: 'Ana', avatar_url: 'https://x/a.png', is_typing: true,
    });
  });

  it('usa "Agente" quando o presente não informa nome', () => {
    const { result } = renderHook(() => useConversationViewers('c1'));
    sb.presenceState = { bruno: [{ }] };
    sync();
    expect(result.current[0]).toMatchObject({ id: 'bruno', name: 'Agente', is_typing: false });
  });

  it('sai do canal ao desmontar', () => {
    const { unmount } = renderHook(() => useConversationViewers('c1'));
    unmount();
    expect(sb.removed).toHaveBeenCalledTimes(1);
  });
});

describe('ViewersIndicator', () => {
  it('não renderiza nada quando não há espectadores', () => {
    const { container } = render(<ViewersIndicator contactId="c1" />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra a contagem de quem está visualizando', () => {
    render(<ViewersIndicator contactId="c1" />);
    sb.presenceState = { ana: [{ name: 'Ana' }], bruno: [{ name: 'Bruno' }] };
    sync();
    expect(screen.getByText('2 visualizando')).toBeInTheDocument();
  });

  it('mostra o aviso "Digitando..." quando alguém está digitando', () => {
    render(<ViewersIndicator contactId="c1" />);
    sb.presenceState = { ana: [{ name: 'Ana', is_typing: true }] };
    sync();
    expect(screen.getByText('Digitando...')).toBeInTheDocument();
    expect(screen.getByText('1 visualizando')).toBeInTheDocument();
  });

  it('não mostra "Digitando..." quando ninguém digita', () => {
    render(<ViewersIndicator contactId="c1" />);
    sb.presenceState = { ana: [{ name: 'Ana', is_typing: false }] };
    sync();
    expect(screen.queryByText('Digitando...')).toBeNull();
  });
});
