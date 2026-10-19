import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MessageContextActions } from '../MessageContextActions';
import type { Message } from '@/types/chat';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    deleteMessage: vi.fn(),
    updateMessage: vi.fn(),
    markMessageAsRead: vi.fn(),
    markMessageAsUnread: vi.fn(),
    archiveChat: vi.fn(),
    updateBlockStatus: vi.fn(),
    isLoading: false,
  }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: AnyProps) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: AnyProps) => <>{children}</>,
  DropdownMenuContent: ({ children }: AnyProps) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: AnyProps) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

const message = {
  id: 'm1',
  sender: 'agent',
  type: 'text',
  content: 'olá',
  external_id: 'ext-1',
  timestamp: new Date(),
  created_at: new Date().toISOString(),
} as unknown as Message;

describe('MessageContextActions — menu de ações com nome acessível (A11Y-13)', () => {
  it('nomeia o botão de mais ações da mensagem', () => {
    render(<MessageContextActions message={message} instanceName="inst" contactJid="5511@s.whatsapp.net" />);
    expect(screen.getByRole('button', { name: 'Mais ações da mensagem' })).toBeInTheDocument();
  });
});
