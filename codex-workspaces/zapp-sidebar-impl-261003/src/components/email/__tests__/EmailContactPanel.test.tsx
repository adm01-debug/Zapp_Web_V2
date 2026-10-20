import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { EmailMessage, EmailThread } from '@/hooks/integrations/useGmail';

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

vi.mock('@/hooks/crm/useContactNotes', () => ({
  useContactNotes: () => ({
    notes: [],
    addNote: vi.fn(),
    isAdding: false,
    isLoading: false,
    error: null,
  }),
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

    it('usa a identidade real da thread quando não há contato CRM', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, contact: undefined, contact_id: null }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText('Alice')).toBeDefined();
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
    });

    it('exibe email do contato', () => {
      render(<EmailContactPanel thread={BASE_THREAD} onClose={vi.fn()} />);
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
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

    it('sem contato usa iniciais do remetente da thread', () => {
      render(
        <EmailContactPanel
          thread={{ ...BASE_THREAD, contact: undefined, contact_id: null }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('A');
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
      expect(screen.getAllByText('-').length).toBeGreaterThan(0);
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
      render(<EmailContactPanel thread={BASE_THREAD} onClose={onClose} />);
      const closeBtn = screen.getByRole('button', { name: /fechar/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('deriva participantes reais das mensagens e permite baixar anexos autenticados', () => {
    const onDownloadAttachment = vi.fn();
    const messages = [{
      id: 'm1', thread_id: 'thread1', gmail_message_id: 'gmail-m1', gmail_account_id: 'acc1',
      from_address: 'alice@example.com', from_name: 'Alice', to_addresses: ['admin@example.com'], cc_addresses: ['financeiro@example.com'], bcc_addresses: [],
      reply_to_address: null, subject: 'Hello World', body_text: '', body_html: '', snippet: '', label_ids: [], is_read: true, is_starred: false,
      has_attachments: true, in_reply_to: null, references_header: null, internal_date: '2026-09-06T10:00:00Z', direction: 'inbound', created_at: '2026-09-06T10:00:00Z',
    }] as EmailMessage[];
    const attachment = { id: 'a1', email_message_id: 'm1', gmail_attachment_id: 'ga1', gmail_message_id: 'gmail-m1', filename: 'proposta.pdf', mime_type: 'application/pdf', size_bytes: 1024 };
    render(<EmailContactPanel thread={BASE_THREAD} messages={messages} attachments={[attachment]} onClose={vi.fn()} onDownloadAttachment={onDownloadAttachment} />);
    expect(screen.getByText('admin@example.com')).toBeDefined();
    expect(screen.getByText('financeiro@example.com')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar proposta.pdf' }));
    expect(onDownloadAttachment).toHaveBeenCalledWith(attachment);
  });

  it('exibe somente dados CRM que realmente existem', () => {
    render(<EmailContactPanel thread={{ ...BASE_THREAD, contact: { ...BASE_THREAD.contact!, company: 'ZBZ Brindes', job_title: 'Diretor', phone: '+55 11 99999-0000' } }} onClose={vi.fn()} />);
    expect(screen.getByText('ZBZ Brindes')).toBeDefined();
    expect(screen.getByText('Diretor')).toBeDefined();
    expect(screen.getByText('+55 11 99999-0000')).toBeDefined();
    expect(screen.queryByText('Sim')).toBeNull();
  });
});
