import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  TemplatesWithVariables,
  VariableHighlighter,
  replaceVariables,
} from '../TemplatesWithVariables';

// Sem o framer-motion os itens removidos do filtro ficam presos no DOM até a
// animação de saída terminar (que o jsdom não roda). O mock devolve as tags
// nativas, então a lista some de verdade e a asserção de ausência é honesta.
vi.mock('framer-motion', () => {
  const semAnimacao = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { initial, animate, exit, transition, variants, whileHover, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { div: semAnimacao('div'), span: semAnimacao('span') },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

const templates = [
  {
    id: '1', title: 'Boas-vindas', content: 'Olá {{nome}}!', category: 'geral',
    shortcut: null, is_global: false, use_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
  },
  {
    id: '2', title: 'Promoção', content: 'Oferta da {{empresa}}', category: 'vendas',
    shortcut: null, is_global: false, use_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
  },
];

function renderComponente() {
  return render(
    <TemplatesWithVariables templates={templates} onUseTemplate={vi.fn()} contactData={{ name: 'Ana Souza' }} />,
  );
}

describe('TemplatesWithVariables — busca e variáveis', () => {
  it('lista todos os templates antes de filtrar', () => {
    renderComponente();
    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
    expect(screen.getByText('Promoção')).toBeInTheDocument();
  });

  it('a busca por título esconde os templates que não batem', () => {
    renderComponente();
    fireEvent.change(screen.getByPlaceholderText('Buscar templates...'), { target: { value: 'promo' } });
    expect(screen.getByText('Promoção')).toBeInTheDocument();
    expect(screen.queryByText('Boas-vindas')).not.toBeInTheDocument();
  });

  it('replaceVariables troca {{nome}} pelo nome do contato', () => {
    expect(replaceVariables('Olá {{nome}}!', { name: 'Ana Souza' })).toBe('Olá Ana Souza!');
  });

  it('VariableHighlighter marca a variável e preserva o texto ao redor', () => {
    render(<VariableHighlighter text="Fala, {{nome}}!" />);
    expect(screen.getByText('nome')).toBeInTheDocument();
    expect(screen.getByText(/Fala,/)).toBeInTheDocument();
  });
});
