/**
 * OTH-005 — a lista virou apresentação: ela NÃO filtra nem recorta o array em memória.
 * Recebe a página do servidor, a contagem exata do servidor e devolve intenção de filtro
 * e de página para quem manda a consulta.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmailThreadList } from '../EmailThreadList';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS, EMAIL_THREAD_PAGE_SIZE } from '@/lib/emailThreadQuery';

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

function makePage(count: number, overrides: (index: number) => Partial<EmailThread> = () => ({})): EmailThread[] {
  return Array.from({ length: count }, (_, index) => makeThread({ id: `t${index + 1}`, last_from_name: `Remetente ${index + 1}`, ...overrides(index) }));
}

const baseProps = {
  totalCount: 1, page: 1, pageCount: 1,
  threadsLoading: false, labels: [] as { id: string; name: string; gmail_label_id: string; label_type: string; unread_count: number }[], unreadCount: 0, selectedThreadId: null,
  activeAccountEmail: 'conta@promobrindes.com.br',
  filters: EMAIL_THREAD_DEFAULT_FILTERS,
  onFiltersChange: () => {}, onSearchChange: () => {}, onResetFilters: () => {}, onPageChange: () => {},
  onSelectThread: () => {}, onNewEmail: () => {}, onSync: () => {}, isSyncing: false,
};

describe('EmailThreadList (OTH-005)', () => {
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

  it('renderiza exatamente a página recebida do servidor, sem recortar em memória', () => {
    // O servidor já mandou a janela: 20 itens da página 2 de 45.
    const page = makePage(EMAIL_THREAD_PAGE_SIZE, index => ({ last_from_name: `Página 2 — Remetente ${index + 21}` }));
    render(<EmailThreadList {...baseProps} threads={page} totalCount={45} page={2} pageCount={3} />);
    expect(screen.getByText('Página 2 — Remetente 21')).toBeInTheDocument();
    expect(screen.getByText('Página 2 — Remetente 40')).toBeInTheDocument();
    expect(screen.getByText('21–40 de 45')).toBeInTheDocument();
    expect(screen.getByLabelText('Página 2 de 3')).toBeInTheDocument();
  });

  it('não inventa página: devolve a intenção de trocar de página', () => {
    const onPageChange = vi.fn();
    render(<EmailThreadList {...baseProps} threads={makePage(20)} totalCount={45} page={1} pageCount={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(screen.getByText('1–20 de 45')).toBeInTheDocument();
  });

  it('devolve a intenção de filtro em vez de filtrar o array', () => {
    const onFiltersChange = vi.fn();
    render(<EmailThreadList {...baseProps} threads={[makeThread()]} onFiltersChange={onFiltersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Com anexo' }));
    expect(onFiltersChange).toHaveBeenCalledWith({ hasAttachments: true });
  });

  it('manda a busca digitada para quem consulta (a espera curta fica na consulta)', () => {
    const onSearchChange = vi.fn();
    render(<EmailThreadList {...baseProps} threads={[makeThread()]} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'Alvo Muito Antigo' } });
    expect(onSearchChange).toHaveBeenCalledWith('Alvo Muito Antigo');
  });

  it('mostra a contagem do servidor, nunca o tamanho da página', () => {
    render(<EmailThreadList {...baseProps} threads={makePage(20)} totalCount={1000} page={1} pageCount={50} />);
    expect(screen.getByText('1–20 de 1000')).toBeInTheDocument();
    expect(screen.getByLabelText('Página 1 de 50')).toBeInTheDocument();
  });

  it('restaura a busca ativa vinda da URL (filtro já resolvido fora da lista)', () => {
    render(<EmailThreadList {...baseProps} threads={[makeThread()]} filters={{ ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'unread', period: '30d', search: 'Maria' }} />);
    expect(screen.getByPlaceholderText('Buscar...')).toHaveValue('Maria');
    expect(screen.getByText('Limpar')).toBeInTheDocument();
  });
});
