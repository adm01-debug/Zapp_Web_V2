import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailThreadList } from '../EmailThreadList';
import type { EmailThread } from '@/hooks/integrations/useGmail';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => {
      if (prop === 'button' || prop === 'div') return ({ children, ...props }: Record<string, unknown>) => <button type="button" {...props}>{children as React.ReactNode}</button>;
      return ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>;
    },
  }),
}));

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 't1', gmail_account_id: 'a1', gmail_thread_id: 'g1', contact_id: null,
    subject: 'Assunto da thread', snippet: 'Trecho de pré-visualização '.repeat(6),
    label_ids: [], message_count: 2, is_unread: true, is_starred: false,
    is_important: false, last_message_at: '2026-09-04T10:00:00-03:00',
    last_from_name: 'Maria Silva', last_from_address: 'maria@exemplo.com',
    assigned_to: null, status: 'open', priority: 'medium', tags: [],
    created_at: '2026-09-01T10:00:00-03:00', updated_at: '2026-09-04T10:00:00-03:00',
    ...overrides,
  } as EmailThread;
}

const baseProps = {
  threadsLoading: false, labels: [] as { id: string; name: string; gmail_label_id: string; label_type: string; unread_count: number }[], unreadCount: 0, selectedThreadId: null,
  activeAccountEmail: 'conta@promobrindes.com.br',
  onSelectThread: () => {}, onNewEmail: () => {}, onSync: () => {}, isSyncing: false,
};

describe('EmailThreadList (h538172)', () => {
  it('usa remetente real (last_from_name) em vez de 1ª palavra do snippet', () => {
    render(<EmailThreadList threads={[makeThread()]} {...baseProps} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('sem contato e sem last_from_name: usa endereço, nunca o snippet', () => {
    const t = makeThread({ last_from_name: null, contact: undefined });
    render(<EmailThreadList threads={[t]} {...baseProps} />);
    expect(screen.getByText('maria@exemplo.com')).toBeInTheDocument();
  });

  it('snippet com line-clamp-2 (classe aplicada)', () => {
    const { container } = render(<EmailThreadList threads={[makeThread()]} {...baseProps} />);
    const clamped = container.querySelector('.line-clamp-2');
    expect(clamped).not.toBeNull();
    expect(clamped?.textContent).toContain('Trecho de pré-visualização');
  });

  it('chips de label com title acessível', () => {
    const labels = [{ id: 'l1', name: 'Nome de label muito comprido para caber', gmail_label_id: 'L1', label_type: 'user', unread_count: 0 }];
    const { container } = render(<EmailThreadList {...baseProps} labels={labels} threads={[]} />);
    const chip = container.querySelector('[title="Nome de label muito comprido para caber"]');
    expect(chip).not.toBeNull();
  });
});
