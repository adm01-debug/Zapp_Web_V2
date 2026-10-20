import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  beforeEach(() => window.history.replaceState({}, '', '/?view=email-chat'));
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

  it('oferece seletor legível de pasta ou marcador sem faixa horizontal de chips', () => {
    const labels = [{ id: 'l1', name: 'Nome de label muito comprido para caber', gmail_label_id: 'L1', label_type: 'user', unread_count: 0 }];
    render(<EmailThreadList {...baseProps} labels={labels} threads={[]} />);
    expect(screen.getByRole('combobox', { name: 'Pasta ou marcador' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nome de label muito comprido para caber' })).not.toBeInTheDocument();
  });

  it('pagina de forma estável e permite alcançar itens além dos primeiros 20', () => {
    const threads = Array.from({ length: 45 }, (_, index) => makeThread({ id: `t${index + 1}`, subject: `Assunto ${index + 1}`, last_from_name: `Remetente ${index + 1}` }));
    render(<EmailThreadList threads={threads} {...baseProps} />);
    expect(screen.getByText('Remetente 1')).toBeInTheDocument();
    expect(screen.queryByText('Remetente 21')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText('Remetente 21')).toBeInTheDocument();
    expect(screen.getByLabelText('Página 2 de 3')).toBeInTheDocument();
  });

  it('busca pelo remetente real mesmo quando estaria depois da primeira página', () => {
    const threads = Array.from({ length: 125 }, (_, index) => makeThread({ id: `t${index + 1}`, subject: `Assunto ${index + 1}`, last_from_name: index === 124 ? 'Alvo Muito Antigo' : `Remetente ${index + 1}` }));
    render(<EmailThreadList threads={threads} {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'Alvo Muito Antigo' } });
    expect(screen.getByText('Alvo Muito Antigo')).toBeInTheDocument();
  });

  it('mantém somente uma página de 20 itens montada em uma caixa com 1.000 threads', () => {
    const threads = Array.from({ length: 1_000 }, (_, index) => makeThread({ id: `bulk-${index}`, last_from_name: `Carga ${index}` }));
    render(<EmailThreadList threads={threads} {...baseProps} />);
    expect(screen.getByText('Carga 0')).toBeInTheDocument();
    expect(screen.queryByText('Carga 20')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Página 1 de 50')).toBeInTheDocument();
  });

  it('restaura e persiste filtros na URL sem remover a rota ativa', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailFilter=unread&emailPeriod=30d&emailQuery=Maria');
    render(<EmailThreadList threads={[makeThread()]} {...baseProps} />);
    expect(screen.getByPlaceholderText('Buscar...')).toHaveValue('Maria');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('email-chat');
    expect(new URLSearchParams(window.location.search).get('emailFilter')).toBe('unread');
    expect(new URLSearchParams(window.location.search).get('emailPeriod')).toBe('30d');
  });

  it('combina estado não lido e refinamento com anexo sem confundir as dimensões', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailFilter=unread');
    const threads = [
      makeThread({ id: 'unread-file', last_from_name: 'Não lido com anexo', is_unread: true, has_attachments: true }),
      makeThread({ id: 'unread-no-file', last_from_name: 'Não lido sem anexo', is_unread: true, has_attachments: false }),
      makeThread({ id: 'read-file', last_from_name: 'Lido com anexo', is_unread: false, has_attachments: true }),
    ];
    render(<EmailThreadList threads={threads} {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Com anexo' }));
    expect(screen.getByText('Não lido com anexo')).toBeInTheDocument();
    expect(screen.queryByText('Não lido sem anexo')).not.toBeInTheDocument();
    expect(screen.queryByText('Lido com anexo')).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('emailAttachment')).toBe('true');
  });
});
