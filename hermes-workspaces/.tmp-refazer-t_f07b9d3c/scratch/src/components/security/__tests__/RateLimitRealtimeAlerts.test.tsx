import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

interface Alerta {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  is_resolved: boolean;
}

const supabaseMock = vi.hoisted(() => {
  const state = {
    selectResult: { data: [] as Alerta[], error: null as null | { message: string } },
    updateResult: { error: null as null | { message: string } },
    fromCalls: 0,
  };
  const from = vi.fn(() => {
    state.fromCalls += 1;
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve(state.selectResult),
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve(state.updateResult),
      }),
    };
  });
  return { state, from };
});

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: supabaseMock.from } }));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundVolume: 70, soundEnabled: false },
    isQuietHours: () => false,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@/utils/securityAlertSound', () => ({ playAlertSound: vi.fn() }));

import { RateLimitRealtimeAlerts } from '../RateLimitRealtimeAlerts';

const alerta = (id: string, over: Partial<Alerta> = {}): Alerta => ({
  id,
  alert_type: 'rate_limit',
  severity: 'medium',
  title: `Alerta ${id}`,
  description: null,
  ip_address: '203.0.113.7',
  created_at: new Date().toISOString(),
  is_resolved: false,
  ...over,
});

beforeEach(() => {
  supabaseMock.state.selectResult = { data: [], error: null };
  supabaseMock.state.updateResult = { error: null };
  supabaseMock.state.fromCalls = 0;
  supabaseMock.from.mockClear();
  toastError.mockClear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('RateLimitRealtimeAlerts', () => {
  it('falha ao dispensar mantém o card visível e avisa por toast', async () => {
    supabaseMock.state.selectResult = { data: [alerta('a1')], error: null };
    supabaseMock.state.updateResult = { error: { message: 'permissão negada' } };

    render(<RateLimitRealtimeAlerts />);

    await screen.findByText('Alerta a1');
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar alerta: Alerta a1' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Não foi possível dispensar o alerta. Tente novamente.'));
    // O card NÃO pode sumir: o update falhou e o alerta voltaria no próximo polling.
    expect(screen.getByText('Alerta a1')).toBeInTheDocument();
  });

  it('dispensar com sucesso remove o card', async () => {
    supabaseMock.state.selectResult = { data: [alerta('a1'), alerta('a2')], error: null };
    supabaseMock.state.updateResult = { error: null };

    render(<RateLimitRealtimeAlerts />);

    await screen.findByText('Alerta a1');
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar alerta: Alerta a1' }));

    await waitFor(() => expect(screen.queryByText('Alerta a1')).not.toBeInTheDocument());
    expect(screen.getByText('Alerta a2')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('aba oculta não consulta os alertas', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    supabaseMock.state.selectResult = { data: [alerta('a1')], error: null };

    render(<RateLimitRealtimeAlerts />);
    await new Promise((r) => setTimeout(r, 30));

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(screen.queryByText('Alerta a1')).not.toBeInTheDocument();
  });

  it('erro de leitura mostra o aviso e o botão Tentar de novo', async () => {
    supabaseMock.state.selectResult = { data: [], error: { message: 'falha de rede' } };

    render(<RateLimitRealtimeAlerts />);

    await screen.findByText('Não foi possível carregar os alertas de segurança.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('mostra só 3 alertas e o contador +N expande os demais', async () => {
    supabaseMock.state.selectResult = { data: [alerta('a1'), alerta('a2'), alerta('a3'), alerta('a4')], error: null };

    render(<RateLimitRealtimeAlerts />);

    await screen.findByText('Alerta a3');
    expect(screen.queryByText('Alerta a4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+1 alerta' }));
    expect(screen.getByText('Alerta a4')).toBeInTheDocument();
  });

  it('axe sem violações no painel de alertas', async () => {
    supabaseMock.state.selectResult = { data: [alerta('a1', { severity: 'high' })], error: null };

    const { container } = render(<RateLimitRealtimeAlerts />);
    await screen.findByText('Alerta a1');

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
