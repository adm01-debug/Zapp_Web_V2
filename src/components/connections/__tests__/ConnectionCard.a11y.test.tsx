import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Cartão t_90dcdcc8, item 1: o botão "mais opções" (MoreVertical) não tinha
// nome acessível — leitor de tela anunciava só "botão". Padrão copiado do
// AutomationCard.tsx (aria-label nos botões só-ícone).

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

describe('ConnectionCard — nome acessível do menu (t_90dcdcc8)', () => {
  it('o botão de mais opções tem aria-label', () => {
    render(<ConnectionCard {...props} />);
    const botao = screen.getByLabelText('Mais opções da conexão');
    expect(botao.tagName).toBe('BUTTON');
  });
});
