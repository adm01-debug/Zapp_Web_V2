/**
 * Nomes acessíveis em pt-BR dos botões só-ícone dos painéis de segurança.
 *
 * Antes da correção, o botão de lixeira (Trash2) de BlockedIPsPanel,
 * IPWhitelistPanel e DeviceCard não tinha nome acessível: o leitor de tela
 * anunciava apenas "botão", sem dizer o que ele faz nem sobre qual item age.
 *
 * A prova renderiza os componentes REAIS; só o cliente Supabase é mockado
 * (mesma abordagem dos testes .select já existentes nesta pasta) — nada de mock
 * que já traga o nome pronto.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockedIPsPanel } from '../BlockedIPsPanel';
import { IPWhitelistPanel } from '../IPWhitelistPanel';
import { DeviceCard } from '../DeviceCard';

vi.mock('@/integrations/supabase/client', () => {
  const rows: Record<string, unknown[]> = {
    blocked_ips: [
      {
        id: 'b1',
        ip_address: '203.0.113.9',
        reason: 'Teste',
        expires_at: null,
        is_permanent: true,
        request_count: 3,
        blocked_at: '2026-10-01T10:00:00.000Z',
      },
    ],
    ip_whitelist: [
      {
        id: 'w1',
        ip_address: '198.51.100.7',
        description: null,
        created_at: '2026-10-01T10:00:00.000Z',
      },
    ],
  };

  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          order: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
        }),
      }),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
}));

const device = {
  id: 'd1',
  device_name: 'Notebook da Ana',
  browser: 'Chrome',
  os: 'Windows',
  ip_address: '198.51.100.7',
  is_trusted: true,
  last_seen_at: '2026-10-01T10:00:00.000Z',
};

describe('Botões só-ícone com nome acessível — painéis de segurança', () => {
  it('BlockedIPsPanel: a lixeira anuncia "Desbloquear IP <ip>"', async () => {
    render(<BlockedIPsPanel />);

    const botao = await screen.findByRole('button', { name: 'Desbloquear IP 203.0.113.9' });
    expect(botao).toBeInTheDocument();
  });

  it('IPWhitelistPanel: a lixeira anuncia "Remover IP <ip> da whitelist"', async () => {
    render(<IPWhitelistPanel />);

    const botao = await screen.findByRole('button', { name: 'Remover IP 198.51.100.7 da whitelist' });
    expect(botao).toBeInTheDocument();
  });

  it('DeviceCard: a lixeira anuncia "Remover dispositivo <nome>"', () => {
    render(
      <DeviceCard
        device={device}
        isCurrentDevice={false}
        isProcessing={false}
        onTrust={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const botao = screen.getByRole('button', { name: 'Remover dispositivo Notebook da Ana' });
    expect(botao).toBeInTheDocument();
  });
});
