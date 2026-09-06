import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadListItem } from '../ThreadListItem';
import type { EmailThread } from '@/hooks/integrations/useGmail';

const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout', 'whileInView']);
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_t, prop: string) => {
      const tag = prop === 'button' ? 'button' : prop === 'span' ? 'span' : 'div';
      return function MotionEl({ children, ...props }: Record<string, unknown>) {
        const safe = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
        return createElement(tag, safe, children as React.ReactNode);
      };
    },
  }),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => <div className={className}>{children}</div>,
  AvatarFallback: ({ children, className }: any) => <span data-testid="avatar-fallback" className={className}>{children}</span>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span data-testid="badge" className={className}>{children}</span>,
}));

vi.mock('lucide-react', () => ({
  Star: ({ className }: any) => <span data-testid="icon-star" className={className} />,
  AlertCircle: ({ className }: any) => <span data-testid="icon-alert" className={className} />,
}));

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'th1',
    gmail_thread_id: 'gt1',
    gmail_account_id: 'a1',
    subject: 'Assunto de teste',
    snippet: 'Trecho do email',
    label_ids: [],
    is_unread: false,
    is_starred: false,
    is_important: false,
    message_count: 1,
    last_message_at: '2026-09-05T10:00:00-03:00',
    last_from_name: null,
    last_from_address: 'remetente@exemplo.com',
    contact: null,
    tags: [],
    status: 'open',
    ...overrides,
  } as EmailThread;
}

describe('ThreadListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza como button clicável', () => {
    render(<ThreadListItem thread={makeThread()} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('displayName prioridade 1: contact.name sobrepõe last_from_name', () => {
    render(<ThreadListItem
      thread={makeThread({ contact: { name: 'Contato CRM', email: 'crm@test.com' } as any, last_from_name: 'Outro Nome' })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('Contato CRM')).toBeInTheDocument();
    expect(screen.queryByText('Outro Nome')).not.toBeInTheDocument();
  });

  it('displayName prioridade 2: last_from_name quando sem contact.name', () => {
    render(<ThreadListItem
      thread={makeThread({ contact: null, last_from_name: 'Nome Remetente' })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('Nome Remetente')).toBeInTheDocument();
  });

  it('displayName prioridade 3: last_from_address quando sem nome', () => {
    render(<ThreadListItem
      thread={makeThread({ contact: null, last_from_name: null, last_from_address: 'addr@test.com' })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('addr@test.com')).toBeInTheDocument();
  });

  it('displayName fallback "Desconhecido" quando sem dados de remetente', () => {
    render(<ThreadListItem
      thread={makeThread({ contact: null, last_from_name: null, last_from_address: '' })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('Desconhecido')).toBeInTheDocument();
  });

  it('subject fallback "(Sem assunto)" quando subject vazio', () => {
    render(<ThreadListItem
      thread={makeThread({ subject: '' })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('(Sem assunto)')).toBeInTheDocument();
  });

  it('exibe badge de contagem quando message_count > 1', () => {
    render(<ThreadListItem
      thread={makeThread({ message_count: 5 })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('não exibe badge de contagem quando message_count = 1', () => {
    render(<ThreadListItem
      thread={makeThread({ message_count: 1 })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    // subject também não é "1", e contagem não deve aparecer
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('exibe ícone Star quando is_starred=true', () => {
    render(<ThreadListItem thread={makeThread({ is_starred: true })} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });

  it('não exibe ícone Star quando is_starred=false', () => {
    render(<ThreadListItem thread={makeThread({ is_starred: false })} isSelected={false} onClick={vi.fn()} />);
    expect(screen.queryByTestId('icon-star')).not.toBeInTheDocument();
  });

  it('exibe ícone AlertCircle quando is_important=true', () => {
    render(<ThreadListItem thread={makeThread({ is_important: true })} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
  });

  it('não exibe ícone AlertCircle quando is_important=false', () => {
    render(<ThreadListItem thread={makeThread({ is_important: false })} isSelected={false} onClick={vi.fn()} />);
    expect(screen.queryByTestId('icon-alert')).not.toBeInTheDocument();
  });

  it('exibe no máximo 3 tags (slice)', () => {
    render(<ThreadListItem
      thread={makeThread({ tags: ['tag1', 'tag2', 'tag3', 'tag4'] })}
      isSelected={false}
      onClick={vi.fn()}
    />);
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
    expect(screen.queryByText('tag4')).not.toBeInTheDocument();
  });

  it('onClick é chamado ao clicar no item', () => {
    const onClick = vi.fn();
    render(<ThreadListItem thread={makeThread()} isSelected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('isSelected=true adiciona classe de destaque bg-primary/5', () => {
    render(<ThreadListItem thread={makeThread()} isSelected={true} onClick={vi.fn()} />);
    expect(screen.getByRole('button').className).toContain('bg-primary/5');
  });

  it('isSelected=false não tem classe bg-primary/5', () => {
    render(<ThreadListItem thread={makeThread()} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button').className).not.toContain('bg-primary/5');
  });
});
