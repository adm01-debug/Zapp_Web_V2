import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Banner honesto (F0/E02 do plano multi-conexão — docs/runbooks/bloqueio-meta.md).
 *
 * Durante a janela de manutenção (`global_settings.whatsapp_maintenance_until`, que o front NÃO
 * lê: o SELECT dessa tabela é admin/supervisor) a edge `evolution-api` recusa `connect` com
 * HTTP 200 + `{ error: true, message }` e a mensagem traz o motivo real ("Ação bloqueada: janela
 * de manutenção do WhatsApp até ...", proteção contra bloqueio da Meta).
 *
 * A faixa de conexões lançava essa recusa como erro genérico e o operador via "Erro ao reconectar
 * PRINCIPAL" — sem saber que era bloqueio da Meta —, insistindo no login em loop, que é
 * exatamente o que estende o bloqueio. Este teste prova que o motivo da edge chega ao operador e
 * que o aviso de sucesso só aparece quando a edge realmente aceitou a ação.
 *
 * PD-38: o banner consulta `connection_alert_preferences` (React Query + useAuth); os testes
 * montam com os provedores do app e o SELECT de preferência devolve `null` (= padrão ligado).
 */
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  preferencias: null as unknown,
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        table === 'connection_alert_preferences'
          ? { maybeSingle: async () => ({ data: h.preferencias, error: null }) }
          : { eq: async () => ({ data: h.rows }) },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, profile: null, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => h.toastSuccess(...args),
    error: (...args: unknown[]) => h.toastError(...args),
  },
}));

import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';

const desconectada = { id: 'c1', instance_id: 'PRINCIPAL', phone_number: null, status: 'disconnected' };

describe('faixa de conexões: o motivo da edge chega ao operador', () => {
  beforeEach(() => {
    h.rows = [desconectada];
    h.invoke.mockReset();
    h.toastSuccess.mockReset();
    h.toastError.mockReset();
  });

  it('recusa da edge por janela de manutenção vira aviso com o motivo, nunca sucesso genérico', async () => {
    const bloqueio =
      'Ação bloqueada: janela de manutenção do WhatsApp até 26/09/2026 10:00 (proteção contra bloqueio da Meta — evita tentativas de login em loop).';
    h.invoke.mockResolvedValue({ data: { error: true, message: bloqueio }, error: null });

    render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    fireEvent.click(await screen.findByRole('button', { name: /reconectar/i }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(bloqueio));
    expect(h.toastError).not.toHaveBeenCalledWith('Erro ao reconectar PRINCIPAL');
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.invoke).toHaveBeenCalledWith(
      'evolution-api/instance/connect',
      expect.objectContaining({ body: { instanceName: 'PRINCIPAL' } }),
    );
  });

  it('recusa sem mensagem cai no texto genérico — o banner não inventa motivo', async () => {
    h.invoke.mockResolvedValue({ data: { error: true }, error: null });

    render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    fireEvent.click(await screen.findByRole('button', { name: /reconectar/i }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Erro ao reconectar PRINCIPAL'));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('quando a edge aceita a ação, o aviso de reconexão continua aparecendo', async () => {
    h.invoke.mockResolvedValue({ data: { qrcode: { base64: 'x' } }, error: null });

    render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    fireEvent.click(await screen.findByRole('button', { name: /reconectar/i }));

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    expect(h.toastError).not.toHaveBeenCalled();
  });
});
