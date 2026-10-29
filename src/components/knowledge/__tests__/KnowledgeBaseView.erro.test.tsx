import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeBaseView } from '../KnowledgeBaseView';

/**
 * t_1944d290 — com a leitura quebrada a tela mostrava contadores zerados e
 * "Nenhum arquivo enviado", como se a base estivesse vazia.
 */
const mocks = vi.hoisted(() => ({ fetchData: vi.fn(), state: {} as Record<string, unknown> }));

vi.mock('@/hooks/integrations/useKnowledgeBase', () => ({
  useKnowledgeBase: () => mocks.state,
  CATEGORIES: ['general'],
  CATEGORY_LABELS: { general: 'Geral' },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('KnowledgeBaseView — falha de leitura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = {
      articles: [],
      files: [],
      loading: false,
      error: 'permission denied for table knowledge_base_articles',
      fetchData: mocks.fetchData,
      saveArticle: vi.fn(),
      deleteArticle: vi.fn(),
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
      reprocessFile: vi.fn(),
    };
  });

  it('mostra o estado de erro e não "Nenhum arquivo enviado"', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });

    expect(screen.getByTestId('kb-error')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar a base de conhecimento')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum arquivo enviado')).not.toBeInTheDocument();
    // Contadores zerados seriam leitura de dado fabricado.
    expect(screen.queryByText('Artigos')).not.toBeInTheDocument();
    expect(screen.queryByText('Indexados')).not.toBeInTheDocument();
  });

  it('"Tentar novamente" chama o fetchData do hook', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    // A tela já carrega sozinha no mount; conta só o clique do botão.
    mocks.fetchData.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(mocks.fetchData).toHaveBeenCalledTimes(1);
  });

  it('sem erro, a lista e os contadores aparecem normalmente', () => {
    mocks.state = {
      ...mocks.state,
      error: null,
      articles: [{ id: 'a1', title: 'Manual da loja', content: 'conteúdo', category: 'general', tags: [], is_published: true, embedding_status: 'completed', updated_at: '2026-10-10T10:00:00Z' }],
    };

    render(<KnowledgeBaseView />, { wrapper: Wrapper });

    expect(screen.queryByTestId('kb-error')).not.toBeInTheDocument();
    expect(screen.getAllByText('Artigos').length).toBeGreaterThan(0);
    expect(screen.getByText('Manual da loja')).toBeInTheDocument();
  });
});
