import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-AUTH-045 / item 269 — "CSAT carrega a configuração sem sincronizar o
 * formulário e pode sobrescrevê-la com defaults".
 *
 * Estado controlado pelos testes: a linha de `csat_auto_config` que o "banco"
 * devolve e o que o formulário manda de volta em update/insert.
 */
const banco = vi.hoisted(() => ({
  config: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const conexoes = [
    { id: 'conn-1', name: 'WhatsApp Vendas', status: 'connected' },
  ];
  const from = (table: string) => {
    if (table === 'whatsapp_connections') {
      return { select: () => Promise.resolve({ data: conexoes, error: null }) };
    }
    // csat_auto_config
    return {
      select: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ data: banco.config, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        banco.updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      insert: (payload: Record<string, unknown>) => {
        banco.inserts.push(payload);
        return Promise.resolve({ error: null });
      },
    };
  };
  return { supabase: { from } };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { CSATAutoConfig } from '../CSATAutoConfig';

const CONFIG_SALVA = {
  id: 'cfg-1',
  is_enabled: true,
  delay_minutes: 45,
  message_template: 'Olá {name}! Avalie de 1 a 5.',
  whatsapp_connection_id: 'conn-1',
  updated_at: '2026-10-01T10:00:00.000Z',
};

const renderConfig = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CSATAutoConfig />
    </QueryClientProvider>,
  );
};

describe('CSATAutoConfig — sincronização do formulário com a configuração carregada', () => {
  beforeEach(() => {
    banco.config = null;
    banco.updates = [];
    banco.inserts = [];
  });

  it('mostra no formulário os valores da configuração carregada', async () => {
    banco.config = { ...CONFIG_SALVA };
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByRole('spinbutton')).toHaveValue(45);
    expect(screen.getByRole('textbox')).toHaveValue('Olá {name}! Avalie de 1 a 5.');
  });

  it('salva os valores carregados em vez dos padrões', async () => {
    banco.config = { ...CONFIG_SALVA };
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('spinbutton')).toHaveValue(45);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => expect(banco.updates).toHaveLength(1));
    expect(banco.inserts).toHaveLength(0);
    expect(banco.updates[0]).toMatchObject({
      is_enabled: true,
      delay_minutes: 45,
      message_template: 'Olá {name}! Avalie de 1 a 5.',
      whatsapp_connection_id: 'conn-1',
      updated_by: 'user-1',
    });
  });

  it('mantém os padrões quando ainda não existe configuração salva', async () => {
    banco.config = null;
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar Configuração' })).toBeInTheDocument();
    });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('spinbutton')).toHaveValue(5);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => expect(banco.inserts).toHaveLength(1));
    expect(banco.updates).toHaveLength(0);
    expect(banco.inserts[0]).toMatchObject({
      is_enabled: false,
      delay_minutes: 5,
      whatsapp_connection_id: null,
    });
  });
});
