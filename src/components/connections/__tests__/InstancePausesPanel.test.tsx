import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  isSupervisor: true,
  rows: [] as unknown[],
  selectError: null as unknown,
  rpc: vi.fn(),
}));

vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: state.isSupervisor }) }));
vi.mock('@/integrations/supabase/client', () => {
  const rows = () => state.rows as Array<{ resumed_at: string | null }>;
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.is = () => Promise.resolve({ data: state.selectError ? null : rows().filter((r) => r.resumed_at === null), error: state.selectError });
  q.gte = () => q;
  q.order = () => q;
  q.range = () => Promise.resolve({ data: state.selectError ? null : state.rows, error: state.selectError });
  return { supabase: { from: () => q, rpc: (...a: unknown[]) => state.rpc(...a) } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InstancePausesPanel } from '../InstancePausesPanel';

const conns = [{ id: 'c1', name: 'Vendas', instance_id: 'inst-1' }];
const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InstancePausesPanel connections={conns} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.isSupervisor = true;
  state.rows = [];
  state.selectError = null;
  state.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
});

describe('InstancePausesPanel', () => {
  it('não renderiza para quem não é staff', () => {
    state.isSupervisor = false;
    renderPanel();
    expect(screen.queryByTestId('instance-pauses-panel')).toBeNull();
  });

  it('estado vazio + pausar chama a RPC com instância, minutos e motivo', async () => {
    renderPanel();
    expect(await screen.findByText(/Nenhuma pausa registrada/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pausar/ }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'manutenção' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Pausar' }).pop() as HTMLElement);
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith('pause_instance', { p_instance: 'inst-1', p_minutes: 30, p_reason: 'manutenção' }),
    );
  });

  it('pausa em vigor mostra Retomar e chama resume_instance', async () => {
    state.rows = [{
      id: 'p1', instance: 'inst-1', paused_until: new Date(Date.now() + 3_600_000).toISOString(), reason: 'limite',
      paused_by: null, auto: true, resumed_at: null, resumed_by: null, created_at: new Date().toISOString(),
    }];
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Retomar/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('resume_instance', { p_instance: 'inst-1' }));
  });

  it('erro de leitura mostra alerta, não lista vazia', async () => {
    state.selectError = new Error('boom');
    renderPanel();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
