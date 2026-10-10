import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Exclusão de artigo da base de conhecimento com confirmação: a lixeira abre o
 * AlertDialog e o `deleteArticle` só é chamado no botão "Excluir". "Cancelar"
 * fecha sem apagar. O componente é o REAL (nenhum mock do diálogo).
 */

const mocks = vi.hoisted(() => ({ deleteArticle: vi.fn() }));

vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/hooks/integrations/useKnowledgeBase', () => ({
  CATEGORIES: ['general'],
  CATEGORY_LABELS: { general: 'Geral' },
  useKnowledgeBase: () => ({
    articles: [
      {
        id: 'art-1',
        title: 'Como configurar o WhatsApp',
        content: 'Passo a passo...',
        category: 'general',
        tags: [],
        is_published: true,
        embedding_status: 'completed',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    files: [],
    loading: false,
    fetchData: vi.fn(),
    saveArticle: vi.fn(),
    deleteArticle: mocks.deleteArticle,
    uploadFile: vi.fn(),
  }),
}));

import { KnowledgeBaseView } from '../KnowledgeBaseView';

beforeEach(() => vi.clearAllMocks());

describe('KnowledgeBaseView — exclusão com confirmação', () => {
  it('a lixeira abre a confirmação e NÃO apaga antes de confirmar; cancelar mantém o artigo', () => {
    render(<KnowledgeBaseView />);

    fireEvent.click(screen.getByLabelText('Excluir artigo'));

    expect(mocks.deleteArticle).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir artigo?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deleteArticle).not.toHaveBeenCalled();
  });

  it('confirmar exclui o artigo certo', () => {
    render(<KnowledgeBaseView />);

    fireEvent.click(screen.getByLabelText('Excluir artigo'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(mocks.deleteArticle).toHaveBeenCalledWith('art-1');
  });
});
