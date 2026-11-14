import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * QA sweep — ChatbotFlowEditor.tsx:135 escondia o botão "Remover nó" para
 * TODO nó do tipo `start`, mas nada no editor impede criar um segundo nó
 * Início (AddNodeDialog oferece `start` como qualquer outro tipo em
 * `nodeTypes`). Resultado: um Início duplicado entra no fluxo e não há
 * nenhuma forma, pela UI, de tirá-lo de lá.
 *
 * Este teste exercita o código REAL do `ChatbotFlowEditor` com dois nós
 * `start` no fluxo: o primeiro (Início canônico) continua protegido, e o
 * segundo (duplicado) tem que oferecer "Remover nó" e sair do fluxo ao
 * clicar — o que falha no código antigo (nenhum dos dois tinha o botão).
 */

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

import { ChatbotFlowEditor } from '@/components/chatbot/ChatbotFlowEditor';
import type { ChatbotEdge, ChatbotFlow, ChatbotNode } from '@/hooks/integrations/useChatbotFlows';

const inicio: ChatbotNode = { id: 'start-1', type: 'start', data: { label: 'Início' }, position: { x: 0, y: 0 } };
const inicioDuplicado: ChatbotNode = { id: 'start-2', type: 'start', data: { label: 'Início' }, position: { x: 0, y: 120 } };
const mensagem: ChatbotNode = { id: 'msg', type: 'message', data: { label: 'Mensagem', content: 'oi' }, position: { x: 0, y: 240 } };

function flow(nodes: ChatbotNode[], edges: ChatbotEdge[] = []): ChatbotFlow {
  return {
    id: 'f1',
    name: 'Fluxo de teste',
    description: null,
    is_active: false,
    trigger_type: 'first_message',
    trigger_value: null,
    nodes,
    edges,
    variables: {},
    whatsapp_connection_id: null,
    created_by: null,
    execution_count: 0,
    last_executed_at: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
  };
}

function renderEditor(nodes: ChatbotNode[], edges: ChatbotEdge[] = []) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<ChatbotFlowEditor flow={flow(nodes, edges)} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
}

describe('ChatbotFlowEditor — unicidade do nó Início (QA sweep)', () => {
  it('mantém o primeiro Início protegido e oferece "Remover nó" só para o duplicado', () => {
    renderEditor([inicio, inicioDuplicado, mensagem]);

    const removerButtons = screen.getAllByRole('button', { name: 'Remover nó' });
    // Só a Mensagem e o Início duplicado podem ser removidos; o Início
    // canônico não entra na lista.
    expect(removerButtons).toHaveLength(2);
  });

  it('remove o Início duplicado do fluxo ao clicar em "Remover nó"', async () => {
    renderEditor([inicio, inicioDuplicado, mensagem]);

    // 3 nós no fluxo = 3 cartões (um botão "Editar nó" por cartão).
    expect(screen.getAllByRole('button', { name: 'Editar nó' })).toHaveLength(3);

    // O segundo cartão de Início é o duplicado — seu botão "Remover nó" é o
    // primeiro da lista (ordem de renderização dos nós).
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover nó' })[0]);

    // AnimatePresence (framer-motion real, não mockado) só tira o cartão do
    // DOM depois da transição de saída — aguarda o nó sumir de fato.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Editar nó' })).toHaveLength(2);
    });
    // Sobra só um "Remover nó": o da Mensagem. O Início canônico continua protegido.
    expect(screen.getAllByRole('button', { name: 'Remover nó' })).toHaveLength(1);
  });

  it('não oferece "Remover nó" quando existe um único Início', () => {
    renderEditor([inicio, mensagem]);

    expect(screen.getAllByRole('button', { name: 'Editar nó' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Remover nó' })).toHaveLength(1);
  });
});
