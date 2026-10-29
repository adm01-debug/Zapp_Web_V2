import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';

/**
 * t_b41eed0b — saúde da conexão no ConnectionCard:
 *  1. "Último check há X" sai do `last_health_check`;
 *  2. "Checar agora" (staff) dispara o health check por conexão;
 *  3. com `historyNotSupported` (Evolution GO) o item "Sincronizar Histórico" some.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: {
    children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  }) => <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));

const { roleState } = vi.hoisted(() => ({
  roleState: { isAdmin: true, isSupervisor: true, roles: ['admin'] as string[], loading: false },
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));

import { ConnectionCard } from '../ConnectionCard';

const baseConnection = {
  id: 'conn-1', name: 'Principal', phone_number: '+55 11 90000-0000', instance_id: 'inst-1',
  status: 'connected', qr_code: null, is_default: true, created_at: '2026-10-08T00:00:00Z',
};

function renderCard(extraProps: Record<string, unknown> = {}, connection = {}) {
  const props = {
    connection: { ...baseConnection, ...connection },
    syncingHistory: null,
    onShowQrCode: vi.fn(), onCopyId: vi.fn(), onDisconnect: vi.fn(), onSetDefault: vi.fn(),
    onDelete: vi.fn(), onBusinessHours: vi.fn(), onQueues: vi.fn(), onSettings: vi.fn(), onSyncHistory: vi.fn(),
    ...extraProps,
  };
  return { ...render(<ConnectionCard {...(props as Parameters<typeof ConnectionCard>[0])} />), props };
}

afterEach(() => cleanup());
beforeEach(() => { roleState.isAdmin = true; roleState.isSupervisor = true; });

describe('ConnectionCard — "Último check há X"', () => {
  it('mostra o tempo desde o último check quando last_health_check existe', () => {
    const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    renderCard({}, { last_health_check: cincoMinAtras });
    expect(screen.getByText(/Último check há 5 minutos/)).toBeTruthy();
  });

  it('não mostra a linha quando last_health_check é nulo', () => {
    renderCard({}, { last_health_check: null });
    expect(screen.queryByText(/Último check/)).toBeNull();
  });

  it('ignora data inválida em vez de renderizar "Invalid Date"', () => {
    renderCard({}, { last_health_check: 'não é data' });
    expect(screen.queryByText(/Último check/)).toBeNull();
  });
});

describe('ConnectionCard — "Checar agora" por conexão (staff)', () => {
  it('staff vê o item e o clique chama onHealthCheck com a conexão', () => {
    const onHealthCheck = vi.fn();
    renderCard({ onHealthCheck });
    const item = screen.getByText('Checar agora');
    fireEvent.click(item);
    expect(onHealthCheck).toHaveBeenCalledTimes(1);
    expect(onHealthCheck.mock.calls[0][0]).toMatchObject({ id: 'conn-1' });
  });

  it('sem a ação (onHealthCheck ausente) o item não aparece', () => {
    renderCard();
    expect(screen.queryByText('Checar agora')).toBeNull();
  });

  it('quem não é staff não vê "Checar agora"', () => {
    roleState.isSupervisor = false;
    roleState.isAdmin = false;
    renderCard({ onHealthCheck: vi.fn() });
    expect(screen.queryByText('Checar agora')).toBeNull();
  });

  it('fica desabilitado enquanto o check da própria conexão roda', () => {
    renderCard({ onHealthCheck: vi.fn(), checkingHealth: 'conn-1' });
    const item = screen.getByRole('menuitem', { name: /Checar agora/ }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
  });
});

describe('ConnectionCard — histórico não suportado (Evolution GO)', () => {
  it('esconde "Sincronizar Histórico" quando historyNotSupported', () => {
    renderCard({ historyNotSupported: true });
    expect(screen.queryByText('Sincronizar Histórico')).toBeNull();
  });

  it('mantém "Sincronizar Histórico" quando suportado', () => {
    renderCard({ historyNotSupported: false });
    expect(screen.getByText('Sincronizar Histórico')).toBeTruthy();
  });
});
