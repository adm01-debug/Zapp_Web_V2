/**
 * N-032 — acessibilidade do NewConversationModal.
 *
 * Prova que:
 *  - o seletor de conexão tem nome acessível (aria-label="Conexão WhatsApp");
 *  - os campos Telefone, Nome, Mensagem e a busca têm rótulo ligado (htmlFor/id);
 *  - os botões de modo expõem aria-pressed;
 *  - sem conexão WhatsApp conectada o envio fica desabilitado e o motivo aparece.
 *
 * O mock do hook é mutável de propósito: cada caso precisa do SEU valor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const hookValue = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/hooks/chat/useNewConversation', () => ({
  useNewConversation: () => hookValue.current,
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
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'div'>) => (
      <div {...props} data-testid="select-trigger">
        {children}
      </div>
    ),
    SelectValue: () => <span>WhatsApp Pessoal</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  };
});
vi.mock('@/lib/utils', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: { button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button> },
    useReducedMotion: vi.fn(() => null),
  };
});
vi.mock('lucide-react', () => ({
  Search: () => null,
  MessageSquarePlus: () => null,
  Send: () => null,
  Loader2: () => null,
  UserPlus: () => null,
  Phone: () => null,
}));

import { NewConversationModal } from '../NewConversationModal';

const CONNECTIONS = [{ id: 'conn-1', name: 'WhatsApp Pessoal' }, { id: 'conn-2', name: 'WhatsApp Comercial' }];

const baseHook = (overrides: Record<string, unknown> = {}) => ({
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
  connections: CONNECTIONS,
  selectedConnection: 'conn-1',
  setSelectedConnection: vi.fn(),
  handleSend: vi.fn(),
  resetForm: vi.fn(),
  ...overrides,
});

const renderar = () => render(<NewConversationModal open={true} onOpenChange={vi.fn()} />);

beforeEach(() => {
  hookValue.current = baseHook();
});

describe('N-032 — seletor de conexão com nome acessível', () => {
  it('o SelectTrigger do seletor de conexão tem aria-label="Conexão WhatsApp"', () => {
    renderar();

    expect(screen.getByTestId('select-trigger')).toHaveAttribute(
      'aria-label',
      'Conexão WhatsApp',
    );
  });

  it('o rótulo "Conexão WhatsApp" está ligado ao seletor por htmlFor/id', () => {
    renderar();

    expect(screen.getByLabelText('Conexão WhatsApp')).toBe(
      screen.getByTestId('select-trigger'),
    );
  });
});

describe('N-032 — rótulos dos campos', () => {
  it('Telefone e Nome (opcional) chegam aos campos pelo rótulo', () => {
    hookValue.current = baseHook({ mode: 'new' });
    renderar();

    expect(screen.getByLabelText(/^Telefone/)).toHaveAttribute('id', 'new-conversation-phone');
    expect(screen.getByLabelText(/^Nome/)).toHaveAttribute('id', 'new-conversation-name');
  });

  it('Mensagem chega ao textarea pelo rótulo', () => {
    renderar();

    expect(screen.getByLabelText('Mensagem')).toHaveAttribute('id', 'new-conversation-message');
  });

  it('a busca por contato tem nome acessível próprio', () => {
    renderar();

    expect(screen.getByLabelText('Buscar por nome ou telefone')).toBeInTheDocument();
  });
});

describe('N-032 — botões de modo expõem aria-pressed', () => {
  it('"Contato existente" é o modo ativo na abertura', () => {
    renderar();

    expect(screen.getByRole('button', { name: /Contato existente/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Novo contato/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Novo contato" é o modo ativo quando o hook abre em modo novo', () => {
    hookValue.current = baseHook({ mode: 'new' });
    renderar();

    expect(screen.getByRole('button', { name: /Novo contato/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Contato existente/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('N-032 — envio sem conexão conectada', () => {
  const prontoParaEnviar = { mode: 'new', newPhone: '+5511999999999', messageText: 'Oi', connections: [] };

  it('sem conexão o motivo aparece e o botão Enviar fica desabilitado', () => {
    hookValue.current = baseHook(prontoParaEnviar);
    renderar();

    expect(screen.getByText('Nenhuma conexão WhatsApp conectada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeDisabled();
  });

  it('com conexão conectada, o mesmo formulário libera o botão Enviar', () => {
    hookValue.current = baseHook({ ...prontoParaEnviar, connections: CONNECTIONS });
    renderar();

    expect(screen.queryByText('Nenhuma conexão WhatsApp conectada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeEnabled();
  });
});
