import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** SL-075 E43: o item "Integrações (IA/Bots)" não pode mais existir. VERMELHO antes; VERDE depois. */

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div role="menuitem">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));

import { ConnectionCard } from '../ConnectionCard';

const connection = { id: 'conn-1', name: 'Principal', phone_number: '+55 11 90000-0000', instance_id: 'inst-1', status: 'connected', qr_code: null, is_default: true, created_at: '2026-10-08T00:00:00Z' };
const props = { connection, syncingHistory: null, onShowQrCode: vi.fn(), onCopyId: vi.fn(), onDisconnect: vi.fn(), onSetDefault: vi.fn(), onDelete: vi.fn(), onBusinessHours: vi.fn(), onQueues: vi.fn(), onSettings: vi.fn(), onSyncHistory: vi.fn() };

describe('ConnectionCard — menu sem as integrações que a GO não tem (E43)', () => {
  it('o item "Integrações (IA/Bots)" não existe mais no menu do card', () => {
    render(<ConnectionCard {...props} />);
    expect(screen.getByText('Configurações & Perfil')).toBeTruthy();
    expect(screen.getByText('Sincronizar Histórico')).toBeTruthy();
    expect(screen.getByText('Excluir')).toBeTruthy();
    expect(screen.queryByText(/Integrações \(IA\/Bots\)/)).toBeNull();
    expect(screen.queryByText(/Integrações/)).toBeNull();
  });
});
