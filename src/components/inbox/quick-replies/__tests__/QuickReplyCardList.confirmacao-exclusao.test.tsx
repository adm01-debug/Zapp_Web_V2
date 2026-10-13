/**
 * Cartão t_5cc4a897 — Respostas rápidas: os quatro botões só-ícone do card
 * (favoritar, copiar, editar, excluir) não tinham nome acessível e o excluir
 * apagava direto, sem confirmação.
 * Este teste FALHA sem a correção e PASSA com ela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickReplyCardList } from '../QuickReplyCardList';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

const template = {
  id: 't1',
  title: 'Boas-vindas',
  content: 'Olá, tudo bem?',
  shortcut: 'bv',
  category: 'geral',
  use_count: 3,
  updated_at: '2026-10-01T12:00:00.000Z',
} as unknown as QuickReplyTemplate;

function renderizar() {
  const props = {
    templates: [template],
    groupedByCategory: { geral: [template] },
    isLoading: false,
    activeTab: 'all',
    searchQuery: '',
    isFavorite: () => false,
    onSelect: vi.fn(),
    onToggleFavorite: vi.fn(),
    onCopy: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onShowCreate: vi.fn(),
  };
  return { ...render(<QuickReplyCardList {...props} />), props };
}

describe('QuickReplyCardList — nomes acessíveis e confirmação de exclusão', () => {
  it('dá nome acessível aos quatro botões de ícone', () => {
    renderizar();
    expect(screen.getByRole('button', { name: 'Favoritar Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Boas-vindas' })).toBeInTheDocument();
  });

  it('não exclui sem confirmação e exclui depois de confirmar', () => {
    const { props } = renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Boas-vindas' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir resposta rápida?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(props.onDelete).toHaveBeenCalledWith('t1');
  });

  it('cancelar não exclui', () => {
    const { props } = renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Boas-vindas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
