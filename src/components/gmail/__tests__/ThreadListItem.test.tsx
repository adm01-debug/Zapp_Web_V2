import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreadListItem } from '../ThreadListItem';
import type { EmailThread } from '@/hooks/integrations/useGmail';

// jsdom não aplica CSS real: as asserções são sobre classes/atributos renderizados,
// não sobre pixels (o layout visual é validado na matriz manual).

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => {
      if (prop === 'button' || prop === 'div') {
        return ({ children, ...props }: Record<string, unknown>) => (
          <button type="button" {...props}>{children as React.ReactNode}</button>
        );
      }
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

const baseProps = { isSelected: false, onClick: () => {} };

describe('ThreadListItem — paridade com o módulo de chat (Fase D)', () => {
  it('iniciais seguem a MESMA cadeia do nome (sem contato, usa last_from_name)', () => {
    render(<ThreadListItem thread={makeThread({ contact: undefined })} {...baseProps} />);
    // nome real no item...
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    // ...e avatar coerente com ele, nunca o "?" de antes
    expect(screen.getByText('MS')).toBeInTheDocument();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });

  it('sem contato e sem last_from_name: iniciais vêm do endereço', () => {
    const t = makeThread({ contact: undefined, last_from_name: null });
    render(<ThreadListItem thread={t} {...baseProps} />);
    expect(screen.getByText('maria@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('contact.name tem precedência sobre last_from_name no nome e nas iniciais', () => {
    const t = makeThread({ contact: { name: 'João Pereira', email: 'joao@exemplo.com' } } as Partial<EmailThread>);
    render(<ThreadListItem thread={t} {...baseProps} />);
    expect(screen.getByText('João Pereira')).toBeInTheDocument();
    expect(screen.getByText('JP')).toBeInTheDocument();
  });

  it('snippet em 2 linhas (line-clamp-2), não mais truncate de 1 linha', () => {
    const { container } = render(<ThreadListItem thread={makeThread()} {...baseProps} />);
    const clamped = container.querySelector('.line-clamp-2');
    expect(clamped).not.toBeNull();
    expect(clamped?.textContent).toContain('Trecho de pré-visualização');
  });

  it('snippet acima do piso legível: text-xs (12px), não text-[10px]', () => {
    const { container } = render(<ThreadListItem thread={makeThread()} {...baseProps} />);
    const snippet = container.querySelector('.line-clamp-2');
    expect(snippet?.className).toContain('text-xs');
    expect(snippet?.className).not.toContain('text-[10px]');
  });

  it('alvo de toque mínimo preservado com o snippet de 2 linhas', () => {
    const { container } = render(<ThreadListItem thread={makeThread()} {...baseProps} />);
    expect(container.querySelector('.min-h-\\[64px\\]')).not.toBeNull();
  });
});
