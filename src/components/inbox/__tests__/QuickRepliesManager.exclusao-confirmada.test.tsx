/**
 * L13 — excluir resposta rápida pede confirmação e a estrela do modo compacto é botão.
 *
 * Antes: `QuickReplyCardList` chamava `deleteTemplate` direto no clique (sem confirmação)
 * e no modo compacto a estrela era um `<svg onClick>` aninhado dentro do botão da linha
 * (alvo de toque inválido e invisível para leitor de tela).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  templates: [{
    id: 'tpl-1',
    title: 'Boas-vindas',
    content: 'Olá! Tudo bem?',
    shortcut: 'bv',
    category: 'geral',
    is_global: false,
    use_count: 3,
    user_id: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }],
  deleteTemplate: vi.fn(),
  toggleFavorite: vi.fn(),
  isFavorite: vi.fn(() => false),
}));

vi.mock('@/hooks/chat/useQuickReplies', () => ({
  useQuickReplies: () => ({
    templates: mocks.templates,
    filteredTemplates: mocks.templates,
    favoriteTemplates: [],
    recentTemplates: [],
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: mocks.deleteTemplate,
    toggleFavorite: mocks.toggleFavorite,
    isFavorite: mocks.isFavorite,
    incrementUseCount: vi.fn(),
    isCreating: false,
    isUpdating: false,
  }),
}));

vi.mock('@/components/inbox/quick-replies/QuickReplyDialog', () => ({ QuickReplyDialog: () => null }));

import { QuickRepliesManager } from '../QuickRepliesManager';

const abrirConfirmacao = (container: HTMLElement) => {
  const lixeira = container.querySelector('button.text-destructive');
  expect(lixeira).not.toBeNull();
  fireEvent.click(lixeira as HTMLElement);
};

beforeEach(() => {
  mocks.deleteTemplate.mockClear();
  mocks.toggleFavorite.mockClear();
  mocks.isFavorite.mockReturnValue(false);
});

describe('L13 — exclusão de resposta rápida pede confirmação', () => {
  it('clicar na lixeira não exclui: abre o diálogo com o título da resposta', () => {
    const { container } = render(<QuickRepliesManager />);

    abrirConfirmacao(container);

    expect(mocks.deleteTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Excluir resposta rápida\?/)).toBeInTheDocument();
    expect(screen.getByText(/"Boas-vindas" será excluída/)).toBeInTheDocument();
  });

  it('confirmar no diálogo exclui a resposta', () => {
    const { container } = render(<QuickRepliesManager />);

    abrirConfirmacao(container);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(mocks.deleteTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteTemplate).toHaveBeenCalledWith('tpl-1');
  });

  it('cancelar mantém a resposta', () => {
    const { container } = render(<QuickRepliesManager />);

    abrirConfirmacao(container);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mocks.deleteTemplate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('L13 — estrela do modo compacto é botão de verdade', () => {
  it('a estrela é um botão próprio, fora do botão da linha', () => {
    render(<QuickRepliesManager compact />);

    const estrela = screen.getByRole('button', { name: 'Favoritar Boas-vindas' });
    expect(estrela.tagName).toBe('BUTTON');
    expect(estrela.closest('button')).toBe(estrela);
    expect(estrela).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicar na estrela favorita a resposta', () => {
    render(<QuickRepliesManager compact />);

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Boas-vindas' }));

    expect(mocks.toggleFavorite).toHaveBeenCalledWith('tpl-1');
  });

  it('resposta já favorita se anuncia como "Remover ... dos favoritos"', () => {
    mocks.isFavorite.mockReturnValue(true);
    render(<QuickRepliesManager compact />);

    const estrela = screen.getByRole('button', { name: 'Remover Boas-vindas dos favoritos' });
    expect(estrela).toHaveAttribute('aria-pressed', 'true');
  });
});
