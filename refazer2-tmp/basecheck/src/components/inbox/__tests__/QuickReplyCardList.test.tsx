import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => (props: Record<string, unknown>) => {
      const { children, initial, animate, exit, transition, layout, ...rest } = props;
      return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { QuickReplyCardList } from '../quick-replies/QuickReplyCardList';

function tpl(over: Partial<QuickReplyTemplate> & { id: string; title: string }): QuickReplyTemplate {
  return {
    content: 'conteúdo', shortcut: null, category: 'geral', is_global: null,
    use_count: 0, user_id: 'u1', created_at: '2026-01-01T12:00:00', updated_at: '2026-01-06T12:00:00',
    ...over,
  };
}

const T1 = tpl({ id: 't1', title: 'Boas-vindas', content: 'Olá!', shortcut: 'boas', use_count: 3 });
const T2 = tpl({ id: 't2', title: 'Orçamento', content: 'Segue o valor', category: 'vendas' });
const T3 = tpl({ id: 't3', title: 'Prazo', content: 'Chega em 5 dias', category: 'vendas' });

function setup(over: Partial<React.ComponentProps<typeof QuickReplyCardList>> = {}) {
  const props = {
    templates: [T1, T2, T3],
    groupedByCategory: { geral: [T1], vendas: [T2, T3] },
    isLoading: false,
    activeTab: 'all',
    searchQuery: '',
    isFavorite: vi.fn().mockReturnValue(false),
    onSelect: vi.fn(),
    onToggleFavorite: vi.fn(),
    onCopy: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onShowCreate: vi.fn(),
    ...over,
  };
  const utils = render(<QuickReplyCardList {...props} />);
  return { ...utils, props };
}

beforeEach(() => cleanup());

describe('QuickReplyCardList — carregando', () => {
  it('mostra três esqueletos de carregamento e nenhum template', () => {
    const { container } = setup({ isLoading: true });
    expect(container.querySelectorAll('div.h-20')).toHaveLength(3);
    expect(screen.queryByText('Boas-vindas')).toBeNull();
  });
});

describe('QuickReplyCardList — vazio', () => {
  it('sem favoritos avisa e não oferece criação', () => {
    setup({ templates: [], groupedByCategory: {}, activeTab: 'favorites' });
    expect(screen.getByText('Nenhuma resposta favorita ainda')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar primeira resposta' })).toBeNull();
  });

  it('com busca avisa que não achou', () => {
    setup({ templates: [], groupedByCategory: {}, searchQuery: 'zzz' });
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar primeira resposta' })).toBeNull();
  });

  it('lista vazia sem busca oferece criar a primeira resposta', () => {
    const { props } = setup({ templates: [], groupedByCategory: {} });
    expect(screen.getByText('Nenhuma resposta criada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar primeira resposta' }));
    expect(props.onShowCreate).toHaveBeenCalledTimes(1);
  });
});

describe('QuickReplyCardList — agrupamento e conteúdo', () => {
  it('mostra a categoria e a contagem no plural/singular', () => {
    setup();
    expect(screen.getByText('geral')).toBeInTheDocument();
    expect(screen.getByText('vendas')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByText('2 itens')).toBeInTheDocument();
  });

  it('mostra título, conteúdo, atalho e usos de cada resposta', () => {
    setup();
    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
    expect(screen.getByText('Olá!')).toBeInTheDocument();
    expect(screen.getByText('boas')).toBeInTheDocument();
    expect(screen.getByText(/3 usos/)).toBeInTheDocument();
  });

  it('mostra a data de atualização em pt-BR', () => {
    setup();
    expect(screen.getAllByText('06/01/2026').length).toBeGreaterThan(0);
  });
});

describe('QuickReplyCardList — ações', () => {
  it('clicar no cartão seleciona o template', () => {
    const { props } = setup();
    fireEvent.click(screen.getByText('Boas-vindas'));
    expect(props.onSelect).toHaveBeenCalledWith(T1);
  });

  it('favoritar NÃO seleciona o template (stopPropagation)', () => {
    const { props, container } = setup();
    const card = screen.getByText('Boas-vindas').closest('div.p-3') as HTMLElement;
    const botoes = card.querySelectorAll('button');
    fireEvent.click(botoes[0]); // primeiro botão do grupo = favoritar
    expect(props.onToggleFavorite).toHaveBeenCalledWith('t1');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('copiar entrega o conteúdo e não seleciona', () => {
    const { props } = setup();
    const card = screen.getByText('Boas-vindas').closest('div.p-3') as HTMLElement;
    fireEvent.click(card.querySelectorAll('button')[1]);
    expect(props.onCopy).toHaveBeenCalledWith('Olá!');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('editar entrega o template e não seleciona', () => {
    const { props } = setup();
    const card = screen.getByText('Boas-vindas').closest('div.p-3') as HTMLElement;
    fireEvent.click(card.querySelectorAll('button')[2]);
    expect(props.onEdit).toHaveBeenCalledWith(T1);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('excluir entrega o id e não seleciona', () => {
    const { props } = setup();
    const card = screen.getByText('Boas-vindas').closest('div.p-3') as HTMLElement;
    fireEvent.click(card.querySelectorAll('button')[3]);
    expect(props.onDelete).toHaveBeenCalledWith('t1');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('marca o cartão favorito com o realce visual', () => {
    setup({ isFavorite: vi.fn().mockReturnValue(true) });
    const card = screen.getByText('Boas-vindas').closest('div.p-3') as HTMLElement;
    expect(card.className).toContain('border-yellow-400/30');
  });
});
