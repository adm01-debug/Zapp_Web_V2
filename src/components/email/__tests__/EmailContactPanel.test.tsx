import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { EmailThread } from '@/hooks/integrations/useGmail';

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: ReactNode }) => <div data-testid="accordion">{children}</div>,
  AccordionItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div data-testid="avatar">{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span data-testid="badge">{children}</span>,
}));

import { EmailContactPanel } from '../EmailContactPanel';

const BASE_THREAD: EmailThread = {
  id: 'thread1',
  gmail_account_id: 'acc1',
  gmail_thread_id: 'gmail-t1',
  subject: 'Hello World',
  is_unread: false,
  is_starred: true,
  message_count: 3,
  tags: [],
  label_ids: [],
  snippet: '',
  contact_id: 'c1',
  last_message_at: '2026-09-06T10:00:00Z',
  last_from_name: 'Alice',
  last_from_address: 'alice@example.com',
  assigned_to: null,
  status: 'open',
  priority: 'medium',
  is_important: false,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  contact: { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', avatar_url: null },
};

describe('EmailContactPanel', () => {
  describe('exibição do contato', () => {
    it('exibe nome do contato quando disponível', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getByText('Alice Smith')).toBeDefined();
    });

    it('exibe "Desconhecido" quando não há contato', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, contact: undefined, contact_id: null }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText('Desconhecido')).toBeDefined();
    });

    it('exibe email do contato', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getByText('alice@example.com')).toBeDefined();
    });
  });

  describe('getInitials', () => {
    it('nome completo → duas primeiras letras maiúsculas', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('AS');
    });

    it('nome com uma palavra → primeira letra', () => {
      render(
        <EmailContactPanel
          thread={{
            ...BASE_THREAD,
            contact: { id: 'c1', name: 'Bob', email: 'bob@example.com', avatar_url: null },
          }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('B');
    });

    it('sem nome mas com email → primeira letra do email maiúscula', () => {
      render(
        <EmailContactPanel
          thread={{
            ...BASE_THREAD,
            contact: { id: 'c1', name: '', email: 'carol@example.com', avatar_url: null },
          }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('C');
    });

    it('sem contato → "?"', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, contact: undefined, contact_id: null }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('?');
    });
  });

  describe('assunto e estatísticas', () => {
    it('exibe assunto da thread na seção Informações', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getByText('Hello World')).toBeDefined();
    });

    it('exibe count de mensagens', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getByText('3 mensagens na thread')).toBeDefined();
    });

    it('last_message_at ausente: exibe "-" na linha de data', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, last_message_at: '' }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText('-')).toBeDefined();
    });
  });

  describe('tags e labels', () => {
    it('exibe tags da thread', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, tags: ['vip', 'suporte'] }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText('vip')).toBeDefined();
      expect(screen.getByText('suporte')).toBeDefined();
    });

    it('exibe "Nenhuma tag" quando tags vazia', () => {
      render(<EmailContactPanel thread={{ ...BASE_THREAD, tags: [] }} onClose={vi.fn()} />);
      expect(screen.getByText('Nenhuma tag')).toBeDefined();
    });

    it('filtra labels do sistema (INBOX, UNREAD, SENT, IMPORTANT)', () => {
      render(
        <EmailContactPanel
          thread={{
            ...BASE_THREAD,
            label_ids: ['INBOX', 'UNREAD', 'SENT', 'IMPORTANT', 'MyLabel'],
          }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText('MyLabel')).toBeDefined();
      expect(screen.queryByText('INBOX')).toBeNull();
      expect(screen.queryByText('UNREAD')).toBeNull();
      expect(screen.queryByText('SENT')).toBeNull();
      expect(screen.queryByText('IMPORTANT')).toBeNull();
    });

    it('nenhum label customizado: não renderiza badges extras de label', () => {
      const { container } = render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, label_ids: ['INBOX', 'UNREAD'] }}
          onClose={vi.fn()}
        />,
      );
      const badges = Array.from(container.querySelectorAll('[data-testid="badge"]'));
      const labelTexts = badges.map(b => b.textContent);
      expect(labelTexts).not.toContain('INBOX');
      expect(labelTexts).not.toContain('UNREAD');
    });
  });

  describe('botão fechar', () => {
    it('clique no X chama onClose', () => {
      const onClose = vi.fn();
      const { container } = render(<EmailContactPanel thread={BASE_THREAD} onClose={onClose} />);
      const header = container.querySelector('.border-b');
      const closeBtn = header?.querySelector('button');
      expect(closeBtn).not.toBeNull();
      fireEvent.click(closeBtn!);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
