import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Fluxos visuais do chatbot: a tela prometia execução que não existe.
 *
 * O código REAL de `ChatbotFlowsView` e `ChatbotFlowEditor` é exercitado. Só o
 * hook de dados é dublado (não há Supabase no jsdom) e os primitivos de UI
 * Radix viram stubs — a afirmação sob teste é o texto que o usuário lê, não o
 * comportamento do Radix. Antes desta correção o aviso não existia e o teste
 * "nenhum motor os executa" falhava nos dois componentes.
 */

const flows = [
  {
    id: 'f1',
    name: 'Fluxo de Boas-vindas',
    description: 'Saudação inicial',
    is_active: true,
    trigger_type: 'keyword' as const,
    trigger_value: 'olá',
    nodes: [],
    edges: [],
    variables: {},
    whatsapp_connection_id: null,
    created_by: null,
    execution_count: 0,
    last_executed_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  },
];

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows,
    isLoading: false,
    createFlow: { mutate: vi.fn(), isPending: false },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: vi.fn() },
    toggleFlow: { mutate: vi.fn() },
  }),
}));

// framer-motion é usado como `motion.div` + `AnimatePresence` + `useReducedMotion` nesta view.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const MotionDiv = ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    );
  return {
    ...actual,

    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" data-value={value} onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

import { ChatbotFlowsView } from '@/components/chatbot/ChatbotFlowsView';
import { ChatbotFlowEditor } from '@/components/chatbot/ChatbotFlowEditor';
import type { ChatbotFlow, ChatbotNode } from '@/hooks/integrations/useChatbotFlows';

const aviso = () => screen.getByRole('note', { name: /Fluxos visuais ainda não respondem/i });

const inicio: ChatbotNode = { id: 'start', type: 'start', data: { label: 'Início' }, position: { x: 0, y: 0 } };
const fim: ChatbotNode = { id: 'end', type: 'end', data: { label: 'Fim' }, position: { x: 0, y: 300 } };

function flow(nodes: ChatbotNode[]): ChatbotFlow {
  return {
    id: 'f1',
    name: 'Fluxo de teste',
    description: null,
    is_active: false,
    trigger_type: 'first_message',
    trigger_value: null,
    nodes,
    edges: [],
    variables: {},
    whatsapp_connection_id: null,
    created_by: null,
    execution_count: 0,
    last_executed_at: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
  };
}

afterEach(() => cleanup());

describe('A lista de fluxos diz que o fluxo visual não executa', () => {
  it('mostra o aviso com o título e o motivo', () => {
    render(
      <main>
        <ChatbotFlowsView />
      </main>,
    );

    expect(aviso()).toBeInTheDocument();
    expect(aviso()).toHaveTextContent('Fluxos visuais ainda não respondem sozinhos');
    expect(aviso()).toHaveTextContent(/nenhum motor os executa/i);
  });

  it('aponta quem responde hoje: o Chatbot IA, por conexão', () => {
    render(
      <main>
        <ChatbotFlowsView />
      </main>,
    );

    expect(aviso()).toHaveTextContent(/Quem responde às mensagens é o Chatbot IA, ligado por conexão/i);
  });

  it('não afirma que ativar já faz responder', () => {
    render(
      <main>
        <ChatbotFlowsView />
      </main>,
    );

    expect(aviso()).toHaveTextContent(/execuções ficam em zero até existir esse motor/i);
  });
});

describe('O editor de fluxos diz que o desenho salvo não executa', () => {
  it('mostra o aviso no topo do editor', () => {
    render(<ChatbotFlowEditor flow={flow([inicio, fim])} onSave={vi.fn()} onClose={vi.fn()} />);

    expect(aviso()).toBeInTheDocument();
    expect(aviso()).toHaveTextContent(/nenhum motor os executa/i);
  });
});
