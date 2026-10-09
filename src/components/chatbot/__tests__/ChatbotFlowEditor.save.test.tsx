import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * R2-MOD-069 (#432) — o editor do fluxo aceitava salvar um nó Condição, Ação ou
 * Transferir sem a configuração que o tipo promete ("o indicador de etapas
 * considera somente a existência de start, quantidade de nós e conexões,
 * podendo alcançar Salvar com esses nós incompletos").
 *
 * Aqui o código REAL do `ChatbotFlowEditor` é exercitado: `Salvar` recusa o
 * fluxo com nó incompleto apontando nó e campo (sem descartar o rascunho), o
 * fluxo completo é entregue inteiro ao `onSave`, a regra salva reaparece no
 * cartão ao reabrir e o ramo escolhido para a ligação que sai de uma Condição
 * viaja no `condition` da aresta.
 *
 * Primitivos de UI são stubs (Radix não responde a `fireEvent` no jsdom); a
 * lógica sob teste — validação, estado do rascunho e arestas — é a do editor.
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
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
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

const start: ChatbotNode = { id: 'start', type: 'start', data: { label: 'Início' }, position: { x: 0, y: 0 } };
const end: ChatbotNode = { id: 'end', type: 'end', data: { label: 'Fim' }, position: { x: 0, y: 300 } };
const condicaoVazia: ChatbotNode = {
  id: 'cond',
  type: 'condition',
  data: { label: 'Condição', condition: { field: '', operator: 'equals', value: '' } },
  position: { x: 0, y: 150 },
};
const condicaoCompleta: ChatbotNode = {
  id: 'cond',
  type: 'condition',
  data: { label: 'Condição', condition: { field: 'resposta', operator: 'contains', value: 'sim' } },
  position: { x: 0, y: 150 },
};

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
  const salvos: { nodes: ChatbotNode[]; edges: ChatbotEdge[] }[] = [];
  const onSave = vi.fn((n: ChatbotNode[], e: ChatbotEdge[]) => { salvos.push({ nodes: n, edges: e }); });
  const onClose = vi.fn();
  render(<ChatbotFlowEditor flow={flow(nodes, edges)} onSave={onSave} onClose={onClose} />);
  return { salvos, onSave, onClose };
}

describe('ChatbotFlowEditor — Salvar e configuração dos nós (R2-MOD-069)', () => {
  it('recusa salvar o fluxo com nó Condição sem regra, apontando nó e campo', () => {
    const { onSave } = renderEditor([start, condicaoVazia]);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).not.toHaveBeenCalled();
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Condição');
    expect(alerta).toHaveTextContent('Campo da condição');
    expect(alerta).toHaveTextContent('Valor da condição');
  });

  it('entrega o fluxo completo ao salvar', () => {
    const { salvos, onSave } = renderEditor([start, condicaoCompleta], [{ id: 'e1', source: 'start', target: 'cond' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].nodes.map(n => n.id)).toEqual(['start', 'cond']);
    expect(salvos[0].nodes[1].data.condition).toEqual({ field: 'resposta', operator: 'contains', value: 'sim' });
    expect(salvos[0].edges).toEqual([{ id: 'e1', source: 'start', target: 'cond' }]);
  });

  it('mostra no cartão a regra da Condição que foi salva', () => {
    renderEditor([start, condicaoCompleta]);

    expect(screen.getByText(/Se resposta contém sim/)).toBeInTheDocument();
  });

  it('leva no condition da aresta o ramo escolhido para a ligação da Condição', () => {
    const { salvos, onSave } = renderEditor([start, condicaoCompleta, end]);

    // Seleciona a Condição e liga ao Fim.
    fireEvent.click(screen.getAllByText('Condição')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Fim' }));

    // O seletor de ramo aparece para a ligação que sai da Condição.
    expect(screen.getByLabelText('Ramo da condição para Fim')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Verdadeiro'));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].edges).toHaveLength(1);
    expect(salvos[0].edges[0].source).toBe('cond');
    expect(salvos[0].edges[0].target).toBe('end');
    expect(salvos[0].edges[0].condition).toBe('true');
  });
});
