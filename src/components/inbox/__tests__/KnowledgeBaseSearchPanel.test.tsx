import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeBaseSearchPanel } from '../KnowledgeBaseSearchPanel';

const h = vi.hoisted(() => ({
  state: {
    query: '',
    articles: [] as { id: string; title: string; content: string; category: string; tags: string[]; rank: number }[],
    isLoading: false,
    isError: false,
  },
  handleSearch: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/hooks/integrations/useKnowledgeBaseSearch', () => ({
  useKnowledgeBaseSearch: () => ({
    ...h.state,
    handleSearch: h.handleSearch,
    clear: h.clear,
    hasResults: h.state.articles.length > 0,
  }),
}));

const artigo = {
  id: 'a1',
  title: 'Prazo de entrega',
  content: 'O prazo padrão é de 10 dias úteis.',
  category: 'Logística',
  tags: ['prazo'],
  rank: 1,
};

beforeEach(() => {
  h.state = { query: '', articles: [], isLoading: false, isError: false };
  vi.clearAllMocks();
});

describe('KnowledgeBaseSearchPanel', () => {
  it('sem termo pede ao menos 2 letras e repassa o que é digitado', () => {
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByText(/ao menos 2 letras/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na base de conhecimento' }), { target: { value: 'pra' } });
    expect(h.handleSearch).toHaveBeenCalledWith('pra');
  });

  it('carregando mostra "Pesquisando..."', () => {
    h.state = { ...h.state, query: 'prazo', isLoading: true };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByTestId('kb-loading')).toHaveTextContent('Pesquisando...');
  });

  it('sem resultado mostra vazio honesto', () => {
    h.state = { ...h.state, query: 'xyz' };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByTestId('kb-empty')).toHaveTextContent('Nenhum artigo encontrado');
  });

  it('erro da RPC não vira "nenhum artigo"', () => {
    h.state = { ...h.state, query: 'prazo', isError: true };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível pesquisar');
    expect(screen.queryByTestId('kb-empty')).toBeNull();
  });

  it('expande o artigo pelo teclado/clique e "Usar" manda o conteúdo para a resposta', () => {
    h.state = { ...h.state, query: 'prazo', articles: [artigo] };
    const onInsertText = vi.fn();
    render(<KnowledgeBaseSearchPanel onInsertText={onInsertText} />);

    const toggle = screen.getByRole('button', { name: /^Prazo de entrega/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('O prazo padrão é de 10 dias úteis.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usar "Prazo de entrega" na resposta' }));
    expect(onInsertText).toHaveBeenCalledWith('O prazo padrão é de 10 dias úteis.');
  });

  it('não oferece copiar para a área de transferência', () => {
    h.state = { ...h.state, query: 'prazo', articles: [artigo] };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();
  });

  it('limpar busca chama clear', () => {
    h.state = { ...h.state, query: 'prazo' };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(h.clear).toHaveBeenCalled();
  });
});
