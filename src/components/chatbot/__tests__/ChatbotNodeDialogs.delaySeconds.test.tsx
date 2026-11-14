import { useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * QA sweep — ChatbotNodeDialogs.tsx:174, nó Aguardar: o campo mostrava
 * `node.data.delaySeconds || 5` mas `onChange` gravava `Number(e.target.value)`
 * sem validar, então o valor exibido podia ficar diferente do valor
 * realmente salvo (ex.: campo vazio exibe "5" mas o nó grava `0`; "-3"
 * grava negativo e exibe "-3", sem fallback) e um fluxo podia ser salvo com
 * um atraso sem sentido prático (NaN, zero ou negativo).
 *
 * Testa o código REAL do `EditNodeDialog`: `sanitizeDelaySeconds` garante
 * que o que é exibido é sempre o que é gravado no nó.
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
import { sanitizeDelaySeconds } from '@/components/chatbot/chatbotNodeConfig';
import type { ChatbotNode } from '@/hooks/integrations/useChatbotFlows';

function node(delaySeconds?: number): ChatbotNode {
  return { id: 'n-delay', type: 'delay', data: { label: 'Aguardar', delaySeconds }, position: { x: 0, y: 0 } };
}

function Harness({
  initial, onSave,
}: { initial: ChatbotNode; onSave: (n: ChatbotNode) => void }) {
  const [current, setCurrent] = useState<ChatbotNode>(initial);
  return <EditNodeDialog node={current} onClose={() => {}} onSave={onSave} onChange={setCurrent} />;
}

function renderNode(initial: ChatbotNode) {
  const salvos: ChatbotNode[] = [];
  const onSave = vi.fn((n: ChatbotNode) => { salvos.push(n); });
  render(<Harness initial={initial} onSave={onSave} />);
  return { salvos, onSave };
}

describe('sanitizeDelaySeconds — normalização pura', () => {
  it('aceita número finito >= 1 sem alterar', () => {
    expect(sanitizeDelaySeconds(12)).toBe(12);
    expect(sanitizeDelaySeconds('30')).toBe(30);
  });

  it('cai no padrão (5) para NaN, zero, negativo ou ausente', () => {
    expect(sanitizeDelaySeconds(Number.NaN)).toBe(5);
    expect(sanitizeDelaySeconds(0)).toBe(5);
    expect(sanitizeDelaySeconds(-3)).toBe(5);
    expect(sanitizeDelaySeconds(undefined)).toBe(5);
    expect(sanitizeDelaySeconds('')).toBe(5);
    expect(sanitizeDelaySeconds('abc')).toBe(5);
  });
});

describe('EditNodeDialog — campo "Tempo de espera (segundos)" (QA sweep)', () => {
  it('exibe o valor salvo (não um fallback diferente do que foi gravado)', () => {
    renderNode(node(12));
    expect(screen.getByLabelText('Tempo de espera (segundos)')).toHaveValue(12);
  });

  it('nunca grava o que digita sem validar: negativo cai no padrão exibido e salvo', () => {
    const { salvos, onSave } = renderNode(node(10));

    fireEvent.change(screen.getByLabelText('Tempo de espera (segundos)'), { target: { value: '-3' } });
    // O código antigo exibiria "-3" (truthy, sem fallback) mas agora o campo
    // mostra o valor realmente gravado no nó.
    expect(screen.getByLabelText('Tempo de espera (segundos)')).toHaveValue(5);

    fireEvent.click(screen.getByText('Salvar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(salvos[0].data.delaySeconds).toBe(5);
  });

  it('campo vazio não grava 0: cai no padrão exibido e salvo', () => {
    const { salvos, onSave } = renderNode(node(10));

    fireEvent.change(screen.getByLabelText('Tempo de espera (segundos)'), { target: { value: '' } });
    // O código antigo exibiria "5" (0 é falsy) mas gravaria 0 no nó — aqui o
    // valor exibido é o mesmo que será salvo.
    expect(screen.getByLabelText('Tempo de espera (segundos)')).toHaveValue(5);

    fireEvent.click(screen.getByText('Salvar'));
    expect(salvos[0].data.delaySeconds).toBe(5);
  });

  it('aceita um valor válido digitado e grava exatamente ele', () => {
    const { salvos } = renderNode(node(5));

    fireEvent.change(screen.getByLabelText('Tempo de espera (segundos)'), { target: { value: '45' } });
    expect(screen.getByLabelText('Tempo de espera (segundos)')).toHaveValue(45);

    fireEvent.click(screen.getByText('Salvar'));
    expect(salvos[0].data.delaySeconds).toBe(45);
  });
});
