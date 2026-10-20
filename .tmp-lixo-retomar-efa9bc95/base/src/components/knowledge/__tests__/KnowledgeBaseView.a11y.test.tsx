import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { KnowledgeBaseView } from '../KnowledgeBaseView';

vi.mock('@/hooks/integrations/useKnowledgeBase', () => {
  const articles = [
    { id: 'art-1', title: 'Como resetar a senha', content: 'Passo a passo para reset...', category: 'general', tags: ['senha'], is_published: true, embedding_status: 'completed', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'art-2', title: 'Guia de onboarding', content: 'Primeiros passos...', category: 'onboarding', tags: ['novo'], is_published: false, embedding_status: 'completed', created_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  return {
    useKnowledgeBase: () => ({
      articles,
      files: [],
      loading: false,
      fetchData: vi.fn(),
      saveArticle: vi.fn().mockResolvedValue(true),
      deleteArticle: vi.fn().mockResolvedValue(true),
      uploadFile: vi.fn(),
    }),
    CATEGORIES: ['general', 'product', 'support', 'sales', 'onboarding', 'technical', 'faq'],
    CATEGORY_LABELS: { general: 'Geral', product: 'Produto', support: 'Suporte', sales: 'Vendas', onboarding: 'Onboarding', technical: 'Técnico', faq: 'FAQ' },
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('KnowledgeBaseView — acessibilidade (N-185)', () => {
  it('botão de editar tem nome acessível com o título do artigo', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    const editBtn = screen.getByRole('button', { name: /Editar artigo: Como resetar a senha/i });
    expect(editBtn).toBeInTheDocument();
  });

  it('botão de excluir tem nome acessível com o título do artigo', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    const deleteBtn = screen.getByRole('button', { name: /Excluir artigo: Como resetar a senha/i });
    expect(deleteBtn).toBeInTheDocument();
  });

  it('seletor de filtro de categoria tem rótulo acessível', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    const select = screen.getByRole('combobox', { name: /filtrar por categoria/i });
    expect(select).toBeInTheDocument();
  });

  it('seletor de categoria no editor tem rótulo acessível', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Novo Artigo/i }));
    const select = screen.getByRole('combobox', { name: /categoria/i });
    expect(select).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    const { container } = render(<KnowledgeBaseView />, { wrapper: Wrapper });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});