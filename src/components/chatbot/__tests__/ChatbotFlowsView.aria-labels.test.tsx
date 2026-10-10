import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows: [
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
        execution_count: 5,
        last_executed_at: null,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'f2',
        name: 'Fluxo de Suporte',
        description: null,
        is_active: false,
        trigger_type: 'first_message' as const,
        trigger_value: null,
        nodes: [],
        edges: [],
        variables: {},
        whatsapp_connection_id: null,
        created_by: null,
        execution_count: 0,
        last_executed_at: null,
        created_at: '2026-10-02T00:00:00.000Z',
        updated_at: '2026-10-02T00:00:00.000Z',
      },
    ],
    isLoading: false,
    createFlow: { mutate: vi.fn(), isPending: false },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: vi.fn() },
    toggleFlow: { mutate: vi.fn() },
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ariaLabel, ...props }: { checked: boolean; onCheckedChange: (v: boolean) => void; 'aria-label'?: string }) => (
    <button role="switch" aria-checked={checked} aria-label={ariaLabel} onClick={() => onCheckedChange(!checked)} {...props} />
  ),
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: React.ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" data-value={value} onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: { children: React.ReactNode; defaultValue: string }) => <div data-default-value={defaultValue}>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => <button role="tab" data-value={value}>{children}</button>,
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => value === 'flows' ? <div>{children}</div> : null,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} />,
}));

vi.mock('@/components/chatbot/ChatbotFlowEditor', () => ({
  ChatbotFlowEditor: () => <div>Editor</div>,
}));

vi.mock('@/components/chatbot/ChatbotExecutionsDashboard', () => ({
  ChatbotExecutionsDashboard: () => <div>Dashboard</div>,
}));

vi.mock('framer-motion', () => {
  const MotionComponent = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>;
  return {
    motion: new Proxy(MotionComponent, {
      get(_target, prop) {
        if (prop === 'div' || prop === 'span' || prop === 'button' || prop === 'nav' || prop === 'ul' || prop === 'li' || prop === 'p' || prop === 'h1' || prop === 'h2' || prop === 'h3' || prop === 'h4' || prop === 'h5' || prop === 'h6' || prop === 'section' || prop === 'header' || prop === 'footer' || prop === 'main' || prop === 'aside' || prop === 'form' || prop === 'label' || prop === 'input' || prop === 'textarea' || prop === 'select' || prop === 'option' || prop === 'table' || prop === 'tr' || prop === 'td' || prop === 'th' || prop === 'thead' || prop === 'tbody' || prop === 'hr' || prop === 'img' || prop === 'a' || prop === 'svg' || prop === 'circle' || prop === 'rect' || prop === 'path' || prop === 'line' || prop === 'polygon' || prop === 'polyline' || prop === 'ellipse' || prop === 'use' || prop === 'g' || prop === 'defs' || prop === 'clipPath' || prop === 'filter' || prop === 'linearGradient' || prop === 'stop') {
          return MotionComponent;
        }
        return MotionComponent;
      },
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Edit2: () => <span data-testid="edit-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
  Tag: () => <span data-testid="tag-icon" />,
  GitBranch: () => <span data-testid="gitbranch-icon" />,
  BarChart3: () => <span data-testid="barchart-icon" />,
  Play: () => <span data-testid="play-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
  MessageSquare: () => <span data-testid="message-icon" />,
  Activity: () => <span data-testid="activity-icon" />,
  ChevronRight: () => <span data-testid="chevron-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  Settings: () => <span data-testid="settings-icon" />,
  HelpCircle: () => <span data-testid="help-icon" />,
  Users: () => <span data-testid="users-icon" />,
  Send: () => <span data-testid="send-icon" />,
}));

import { ChatbotFlowsView } from '@/components/chatbot/ChatbotFlowsView';

describe('ChatbotFlowsView — aria-labels acessíveis', () => {
  it('o Switch de cada fluxo tem aria-label com o nome do fluxo', () => {
    render(<ChatbotFlowsView />);

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);

    expect(switches[0]).toHaveAttribute('aria-label', 'Ativar/desativar Fluxo de Boas-vindas');
    expect(switches[1]).toHaveAttribute('aria-label', 'Ativar/desativar Fluxo de Suporte');
  });

  it('o botão de editar tem aria-label com o nome do fluxo', () => {
    render(<ChatbotFlowsView />);

    const editButtons = screen.getAllByRole('button', { name: /Editar fluxo/ });
    expect(editButtons).toHaveLength(2);
    expect(editButtons[0]).toHaveAttribute('aria-label', 'Editar fluxo Fluxo de Boas-vindas');
    expect(editButtons[1]).toHaveAttribute('aria-label', 'Editar fluxo Fluxo de Suporte');
  });

  it('o botão de duplicar tem aria-label com o nome do fluxo', () => {
    render(<ChatbotFlowsView />);

    const dupButtons = screen.getAllByRole('button', { name: /Duplicar fluxo/ });
    expect(dupButtons).toHaveLength(2);
    expect(dupButtons[0]).toHaveAttribute('aria-label', 'Duplicar fluxo Fluxo de Boas-vindas');
    expect(dupButtons[1]).toHaveAttribute('aria-label', 'Duplicar fluxo Fluxo de Suporte');
  });

  it('o botão de excluir tem aria-label com o nome do fluxo', () => {
    render(<ChatbotFlowsView />);

    const delButtons = screen.getAllByRole('button', { name: /Excluir fluxo/ });
    expect(delButtons).toHaveLength(2);
    expect(delButtons[0]).toHaveAttribute('aria-label', 'Excluir fluxo Fluxo de Boas-vindas');
    expect(delButtons[1]).toHaveAttribute('aria-label', 'Excluir fluxo Fluxo de Suporte');
  });
});