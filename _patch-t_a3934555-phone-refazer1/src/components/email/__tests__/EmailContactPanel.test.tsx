import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
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

vi.mock('@/hooks/crm/useEmailContactContext', () => ({
  useEmailContactContext: vi.fn(),
}));

import { EmailContactPanel } from '../EmailContactPanel';
import { useEmailContactContext } from '@/hooks/crm/useEmailContactContext';

const contextQuery = vi.mocked(useEmailContactContext);

beforeEach(() => {
  contextQuery.mockReturnValue({ data: null, status: 'not_linked', isFetching: false, error: null, refetch: vi.fn() } as never);
});

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
  it('renders only the safe company fields returned by the Email context', () => {
    contextQuery.mockReturnValue({
      data: {
        status: 'available',
        company: {
          id: 'company-1', name: 'ACME Ltda', legalName: null, website: 'https://acme.example.com', logoUrl: null,
          industry: 'Brindes', location: 'São Paulo, SP, Brasil', about: 'Descrição empresarial',
          relationships: ['cliente', 'fornecedor'], relationshipsKnown: true,
          socials: [
            { platform: 'linkedin', url: 'https://linkedin.com/company/acme' },
            { platform: 'instagram', url: 'https://instagram.com/acme' },
          ],
          socialsKnown: true, aboutKnown: true,
          updatedAt: null,
        },
        source: { linked: true, consultedAt: '2026-10-03T12:00:00Z' },
      },
      status: 'available', isFetching: false, error: null, refetch: vi.fn(),
    } as never);
    render(<EmailContactPanel accountId="acc1" thread={BASE_THREAD} onClose={vi.fn()} />);
    expect(screen.getByText('ACME Ltda')).toBeDefined();
    expect(screen.getByText('Cliente')).toBeDefined();
    expect(screen.getByText('Fornecedor')).toBeDefined();
    expect(screen.getByRole('link', { name: /abrir linkedin/i }).getAttribute('href')).toBe('https://linkedin.com/company/acme');
    expect(screen.getByRole('link', { name: /abrir instagram/i }).getAttribute('href')).toBe('https://instagram.com/acme');
    expect(screen.getByText(/vinculada ao singu crm/i)).toBeDefined();
  });

  it('does not mistake a disabled CRM integration for a missing company', () => {
    contextQuery.mockReturnValue({ data: null, status: 'disabled', isFetching: false, error: null, refetch: vi.fn() } as never);
    render(<EmailContactPanel accountId="acc1" thread={BASE_THREAD} onClose={vi.fn()} />);
    expect(screen.getByText(/integração crm desativada/i)).toBeDefined();
  });

  it('informs an authorized user when the explicit company link fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('CRM identity conflict'));
    contextQuery.mockReturnValue({
      data: {
        status: 'available',
        company: {
          id: 'company-1', name: 'ACME Ltda', legalName: null, website: null, logoUrl: null,
          industry: null, location: null, about: null, relationships: [], relationshipsKnown: true,
          socials: [], socialsKnown: true, aboutKnown: true, updatedAt: null,
        },
        source: { linked: false, consultedAt: '2026-10-03T12:00:00Z', selectedExternalContactId: 'external-1', canLink: true },
      },
      status: 'available', isFetching: false, error: null, refetch: vi.fn(),
      linkCompany: { isPending: false, mutateAsync },
    } as never);
    render(<EmailContactPanel accountId="acc1" thread={BASE_THREAD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /vincular empresa ao contato/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/não foi possível vincular esta empresa/i));
    expect(mutateAsync).toHaveBeenCalledWith('external-1');
  });

  describe('exibição do contato', () => {
    it('exibe nome do contato quando disponível', () => {
      render(<EmailContactPanel accountId="acc1" thread={BASE_THREAD} onClose={vi.fn()} />);
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

    it('não troca o interlocutor pela própria conta após uma resposta enviada', () => {
      const messages: EmailMessage[] = [
        {
          id: 'outbound', thread_id: 'thread1', gmail_message_id: 'g-outbound', gmail_account_id: 'acc1',
          from_address: 'agent@example.com', from_name: 'Agente', to_addresses: ['alice@example.com'], cc_addresses: [], bcc_addresses: [],
          reply_to_address: null, subject: 'Hello', body_text: '', body_html: '', snippet: '', label_ids: [], is_read: true,
          is_starred: false, has_attachments: false, in_reply_to: null, references_header: null,
          internal_date: '2026-09-06T11:00:00Z', direction: 'outbound', created_at: '2026-09-06T11:00:00Z',
        },
        {
          id: 'inbound', thread_id: 'thread1', gmail_message_id: 'g-inbound', gmail_account_id: 'acc1',
          from_address: 'alice@example.com', from_name: 'Alice', to_addresses: ['agent@example.com'], cc_addresses: [], bcc_addresses: [],
          reply_to_address: null, subject: 'Hello', body_text: '', body_html: '', snippet: '', label_ids: [], is_read: true,
          is_starred: false, has_attachments: false, in_reply_to: null, references_header: null,
          internal_date: '2026-09-06T10:00:00Z', direction: 'inbound', created_at: '2026-09-06T10:00:00Z',
        },
      ];
      render(<EmailContactPanel accountEmail="agent@example.com" thread={{ ...BASE_THREAD, contact: undefined, contact_id: null, last_from_name: 'Agente', last_from_address: 'agent@example.com' }} messages={messages} onClose={vi.fn()} />);
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
      expect(screen.getByRole('heading', { name: 'Alice' })).toBeDefined();
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

  it('preserva conversas relacionadas além da amostra inicial', () => {
    const relatedThreads = Array.from({ length: 6 }, (_, index) => ({
      ...BASE_THREAD,
      id: `related-${index}`,
      subject: `Conversa relacionada ${index + 1}`,
    }));
    render(<EmailContactPanel accountId="acc1" thread={BASE_THREAD} relatedThreads={relatedThreads} onClose={vi.fn()} onSelectRelated={vi.fn()} />);
    expect(screen.queryByText('Conversa relacionada 6')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos (+1)' }));
    expect(screen.getByText('Conversa relacionada 6')).toBeDefined();
  });

  it('exibe somente dados CRM que realmente existem', () => {
    render(<EmailContactPanel thread={{ ...BASE_THREAD, contact: { ...BASE_THREAD.contact!, company: 'ZBZ Brindes', job_title: 'Diretor', phone: '+55 11 99999-0000' } }} onClose={vi.fn()} />);
    expect(screen.getByText('ZBZ Brindes')).toBeDefined();
    expect(screen.getByText('Diretor')).toBeDefined();
    expect(screen.getByText('+55 11 99999-0000')).toBeDefined();
    expect(screen.queryByText('Sim')).toBeNull();
  });
});
