// Regressao do bump supabase-js 2.116 (#460): desde a realtime-js 2.101,
// `.on()` em canal ja inscrito lanca erro e `supabase.channel(nome)` reaproveita
// o canal de mesmo nome. Hooks com topico fixo montados em dois componentes ao
// mesmo tempo (TalkXView > TalkXCampaignScheduled, QueuesView > QueueGoalsDialog,
// DashboardView > AgentPerformancePanel) derrubavam a tela.
// Usa o createClient REAL com WebSocket falso (sem rede).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  class FakeWS { readyState = 0; send() {} close() {} addEventListener() {} removeEventListener() {} }
  const fetchImpl = async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  const supabase = createClient('http://127.0.0.1:9', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl as unknown as typeof fetch },
    realtime: { transport: FakeWS as unknown as typeof WebSocket },
  });
  return { supabase, SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'x', GOOGLE_OAUTH_ENABLED: false };
});

import { useTalkX } from '@/hooks/integrations/useTalkX';
import { useQueueGoals } from '@/hooks/business/useQueueGoals';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';

class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  componentDidCatch() {}
  render() {
    return this.state.err
      ? <div data-testid="crash">{this.state.err}</div>
      : <>{this.props.children}<div data-testid="ok">ok</div></>;
  }
}
function Parent({ hook, child }: { hook: () => unknown; child: boolean }) { hook(); return child ? <Child hook={hook} /> : null; }
function Child({ hook }: { hook: () => unknown }) { hook(); return null; }

const cases: Array<[string, () => unknown]> = [
  ['useTalkX', () => useTalkX()],
  ['useQueueGoals', () => useQueueGoals()],
  ['useLeaderboard', () => useLeaderboard()],
];

describe('realtime: dois consumidores simultaneos do mesmo hook', () => {
  for (const [name, hook] of cases) {
    it(`${name} nao derruba a tela quando montado duas vezes`, async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = (child: boolean) => (
        <QueryClientProvider client={qc}><Boundary><Parent hook={hook} child={child} /></Boundary></QueryClientProvider>
      );
      const { rerender, unmount } = render(tree(false));
      await waitFor(() => screen.getByTestId('ok'));
      rerender(tree(true));
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByTestId('crash')?.textContent ?? null).toBeNull();
      unmount();
      spy.mockRestore();
    });
  }
});
