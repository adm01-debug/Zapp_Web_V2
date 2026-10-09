/**
 * N-032 — seletor de conexão do NewConversationModal tem nome acessível.
 *
 * Prova que o <SelectTrigger> do seletor de conexão WhatsApp tem
 * aria-label="Conexão WhatsApp", tornando o seletor legível por leitores
 * de tela no celular.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/chat/useNewConversation', () => ({
  useNewConversation: () => ({
    searchQuery: '',
    setSearchQuery: vi.fn(),
    contacts: [],
    selectedContact: null,
    setSelectedContact: vi.fn(),
    newPhone: '',
    setNewPhone: vi.fn(),
    newName: '',
    setNewName: vi.fn(),
    messageText: '',
    setMessageText: vi.fn(),
    isLoading: false,
    isSending: false,
    mode: 'search',
    setMode: vi.fn(),
    connections: [{ id: 'conn-1', name: 'WhatsApp Pessoal' }, { id: 'conn-2', name: 'WhatsApp Comercial' }],
    selectedConnection: 'conn-1',
    setSelectedConnection: vi.fn(),
    handleSend: vi.fn(),
    resetForm: vi.fn(),
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}));
vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/select', async () => {
  const actual = await vi.importActual('@/components/ui/select');
  return {
    ...actual,
    SelectTrigger: ({ children, className, 'aria-label': ariaLabel, ...props }: React.ComponentProps<'div'>) => (
      <div className={className} aria-label={ariaLabel} data-testid="select-trigger">
        {children}
      </div>
    ),
    SelectValue: () => <span>WhatsApp Pessoal</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  };
});
vi.mock('@/lib/utils', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));
vi.mock('framer-motion', () => ({ motion: { button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button> } }));
vi.mock('lucide-react', () => ({
  Search: () => null,
  MessageSquarePlus: () => null,
  Send: () => null,
  Loader2: () => null,
  UserPlus: () => null,
  Phone: () => null,
}));

import { NewConversationModal } from '../NewConversationModal';

describe('N-032 — seletor de conexão com nome acessível', () => {
  it('o SelectTrigger do seletor de conexão tem aria-label="Conexão WhatsApp"', () => {
    render(
      <NewConversationModal
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('select-trigger')).toHaveAttribute(
      'aria-label',
      'Conexão WhatsApp',
    );
  });
});