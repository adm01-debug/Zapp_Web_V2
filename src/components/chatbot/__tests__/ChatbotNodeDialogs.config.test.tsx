import { useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * R2-MOD-069 (#432) — "Editor de Chatbot oferece condição, ação e transferência
 * sem configuração correspondente".
 *
 * O diálogo de edição oferecia Nome para todos os tipos, conteúdo/opções para
 * mensagem/pergunta e segundos para atraso — e nada para `condition`, `action`
 * ou `transferTo`, que estão declarados em `ChatbotNode['data']`. O nó Condição,
 * Ação ou Transferir saía da interface como um símbolo vazio, e `Salvar` não
 * recusava.
 *
 * Estes testes pinam o contrato de autoria desses três tipos pelo código REAL do
 * diálogo: os campos existem, escrevem no `data` do nó, `Salvar` recusa o nó
 * incompleto apontando o campo (com o rascunho preservado) e o nó já configurado
 * reabre mostrando o que foi salvo.
 *
 * Os primitivos de UI são trocados por stubs (padrão da casa para Radix em
 * jsdom — ver `AutomationEditorDialog.test.tsx`); o `Select` publica o próprio
 * `onValueChange` por contexto para que clicar num item troque o valor.
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

import { EditNodeDialog } from '@/components/chatbot/ChatbotNodeDialogs';
import type { ChatbotNode } from '@/hooks/integrations/useChatbotFlows';

function node(type: ChatbotNode['type'], data: ChatbotNode['data']): ChatbotNode {
  return { id: `n-${type}`, type, data, position: { x: 0, y: 0 } };
}

/**
 * Reproduz o editor de fluxo: `onChange` realimenta o `node` que o diálogo
 * recebe, como faz o `editingNode` do `ChatbotFlowEditor`. Sem isso não dava
 * para provar que o rascunho sobrevive à recusa do `Salvar`.
 */
function Harness({
  initial, onSave, onClose,
}: { initial: ChatbotNode; onSave: (n: ChatbotNode) => void; onClose: () => void }) {
  const [current, setCurrent] = useState<ChatbotNode>(initial);
  return <EditNodeDialog node={current} onClose={onClose} onSave={onSave} onChange={setCurrent} />;
}

function renderNode(initial: ChatbotNode) {
  const salvos: ChatbotNode[] = [];
  const onSave = vi.fn((n: ChatbotNode) => { salvos.push(n); });
  const onClose = vi.fn();
  const view = render(<Harness initial={initial} onSave={onSave} onClose={onClose} />);
  return { salvos, onSave, onClose, ...view };
}

describe('EditNodeDialog — configuração de condição, ação e transferência (R2-MOD-069)', () => {
  it('oferece a regra do nó Condição e leva campo, operador e valor ao nó', () => {
    const { salvos, onSave } = renderNode(node('condition', { label: 'Condição' }));

    expect(screen.getByLabelText('Campo da condição')).toBeInTheDocument();
    expect(screen.getByLabelText('Operador da condição')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor da condição')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Campo da condição'), { target: { value: 'resposta' } });
    fireEvent.click(screen.getByText('contém'));
    fireEvent.change(screen.getByLabelText('Valor da condição'), { target: { value: 'sim' } });
    fireEvent.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].data.condition).toEqual({ field: 'resposta', operator: 'contains', value: 'sim' });
  });

  it('oferece a ação do nó Ação e leva a ação escolhida ao nó', () => {
    const { salvos, onSave } = renderNode(node('action', { label: 'Ação' }));

    fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'send_message' } });
    fireEvent.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].data.action).toBe('send_message');
  });

  it('oferece o destino do nó Transferir e leva o destino ao nó', () => {
    const { salvos, onSave } = renderNode(node('transfer', { label: 'Transferir' }));

    fireEvent.change(screen.getByLabelText('Destino da transferência'), {
      target: { value: 'fila-suporte' },
    });
    fireEvent.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].data.transferTo).toBe('fila-suporte');
  });

  it('recusa o nó Condição sem regra, aponta o campo e mantém o rascunho aberto', () => {
    const { onSave, onClose } = renderNode(node('condition', { label: 'Condição' }));

    fireEvent.click(screen.getByText('Salvar'));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Campo da condição');
    expect(alerta).toHaveTextContent('Valor da condição');

    // O rascunho está preservado: preencher o campo tira a pendência da lista.
    fireEvent.change(screen.getByLabelText('Campo da condição'), { target: { value: 'resposta' } });
    expect(screen.getByRole('alert')).not.toHaveTextContent('Campo da condição');
    expect(screen.getByRole('alert')).toHaveTextContent('Valor da condição');
  });

  it('recusa o nó Ação e o nó Transferir vazios apontando o campo que falta', () => {
    const acao = renderNode(node('action', { label: 'Ação' }));
    fireEvent.click(screen.getByText('Salvar'));
    expect(screen.getByRole('alert')).toHaveTextContent('Ação');
    acao.unmount();

    renderNode(node('transfer', { label: 'Transferir' }));
    fireEvent.click(screen.getByText('Salvar'));
    expect(screen.getByRole('alert')).toHaveTextContent('Destino da transferência');
  });

  it('reabre o nó já configurado mostrando a regra que foi salva', () => {
    renderNode(node('condition', {
      label: 'Condição',
      condition: { field: 'resposta', operator: 'contains', value: 'sim' },
    }));

    expect(screen.getByLabelText('Campo da condição')).toHaveValue('resposta');
    expect(screen.getByLabelText('Valor da condição')).toHaveValue('sim');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
