import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * R2-API-063 — "Painéis Omnichannel apresentam cadastro pendente como canal conectado".
 *
 * Defeito provado aqui: o painel Canais do OmnichannelInbox tratava TODA linha
 * ativa de `channel_connections_safe` como conexão operacional — contava em
 * "canais conectados" e pintava o ponto verde — mesmo quando o `status` era
 * `pending_setup` (cadastro sem credenciais). Um canal recém-criado aparecia
 * como conectado sem nenhuma conexão real com o provedor.
 *
 * Aceite coberto: separar cadastro (is_active) de conexão operacional (status
 * `connected`); mostrar `pending_setup` como pendente; canal recém-criado sem
 * credenciais não entra como conectado; zero/erro têm estado explícito.
 */

type Conn = { id: string; channel_type: string; name: string; status?: string | null; is_active?: boolean };

const state: { connections: Conn[]; connectionsError: { message: string } | null } = {
  connections: [],
  connectionsError: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'channel_connections_safe') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: state.connections, error: state.connectionsError }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      };
    }),
  },
}));

import { OmnichannelInbox } from '../OmnichannelInbox';

describe('OmnichannelInbox — cadastro pendente não é canal conectado (R2-API-063)', () => {
  beforeEach(() => {
    state.connections = [];
    state.connectionsError = null;
  });

  it('conta só as conexões operacionais e rotula o pending_setup como pendente', async () => {
    state.connections = [
      { id: 'conn-ok', channel_type: 'instagram', name: 'Instagram Oficial', status: 'connected', is_active: true },
      { id: 'conn-pending', channel_type: 'telegram', name: 'Telegram Novo', status: 'pending_setup', is_active: true },
    ];

    const { container } = render(<OmnichannelInbox />);
    await waitFor(() => expect(screen.getByText('Instagram Oficial')).toBeInTheDocument());

    expect(screen.getByText(/1 canal conectado/)).toBeInTheDocument();
    expect(screen.queryByText(/2 canais conectados/)).toBeNull();
    expect(container.querySelectorAll('[data-connection-state="connected"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-connection-state="pending"]')).toHaveLength(1);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('canal recém-criado sem credenciais não aparece como conectado', async () => {
    state.connections = [
      { id: 'conn-1', channel_type: 'telegram', name: 'Telegram Pendente', status: 'pending_setup', is_active: true },
    ];

    const { container } = render(<OmnichannelInbox />);
    await waitFor(() => expect(screen.getByText('Telegram Pendente')).toBeInTheDocument());

    expect(screen.getByText(/0 canais conectados/)).toBeInTheDocument();
    expect(screen.getByText('Nenhum canal conectado')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-connection-state="connected"]')).toHaveLength(0);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('trata status desconectado como não-operacional', async () => {
    state.connections = [
      { id: 'conn-2', channel_type: 'instagram', name: 'Instagram Antigo', status: 'disconnected', is_active: true },
    ];

    const { container } = render(<OmnichannelInbox />);
    await waitFor(() => expect(screen.getByText('Instagram Antigo')).toBeInTheDocument());

    expect(screen.getByText(/0 canais conectados/)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-connection-state="disconnected"]')).toHaveLength(1);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('zero conexões: ausência explícita, sem substituir por constante', async () => {
    state.connections = [];
    render(<OmnichannelInbox />);

    await waitFor(() => expect(screen.getByText('Nenhum canal conectado')).toBeInTheDocument());
    expect(screen.getByText(/0 canais conectados/)).toBeInTheDocument();
  });

  it('erro na consulta: estado de erro explícito, não "nenhum canal"', async () => {
    state.connectionsError = { message: 'boom' };
    render(<OmnichannelInbox />);

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível carregar os canais/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Nenhum canal conectado')).toBeNull();
  });
});
