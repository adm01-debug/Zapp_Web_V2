import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeBaseSearchPanel } from '../KnowledgeBaseSearchPanel';

const h = vi.hoisted(() => ({
  state: {
    query: '',
    articles: [] as { id: string; title: string; content: string; category: string; tags: string[]; rank: number }[],
    isLoading: false,
    isFetching: false,
    isError: false,
    debounced: null as string | null,
  },
  handleSearch: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/hooks/integrations/useKnowledgeBaseSearch', () => ({
  useKnowledgeBaseSearch: () => ({
    ...h.state,
    isSearching: h.state.query.trim().length >= 2,
    isDebouncing: h.state.query.trim().length >= 2 && h.state.query.trim() !== (h.state.debounced ?? h.state.query.trim()),
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
  h.state = { query: '', articles: [], isLoading: false, isFetching: false, isError: false, debounced: null };
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
    h.state = { ...h.state, query: 'prazo', isLoading: true, isFetching: true };
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

  it('durante o debounce mostra "Pesquisando..." e não "Nenhum artigo encontrado"', () => {
    h.state = { ...h.state, query: 'praz', debounced: 'pra' };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByTestId('kb-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('kb-empty')).toBeNull();
  });

  it('com 1 letra mostra só a dica, sem resultados antigos', () => {
    h.state = { ...h.state, query: 'p', articles: [artigo] };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByText(/ao menos 2 letras/)).toBeInTheDocument();
    expect(screen.queryByText('Prazo de entrega')).toBeNull();
  });

  it('espaços não contam como letras: "  a" é só a dica', () => {
    h.state = { ...h.state, query: '  a' };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.getByText(/ao menos 2 letras/)).toBeInTheDocument();
    expect(screen.queryByTestId('kb-loading')).toBeNull();
    expect(screen.queryByTestId('kb-empty')).toBeNull();
  });

  it('resultados antigos não aparecem enquanto o novo termo está no debounce', () => {
    h.state = { ...h.state, query: 'entrega', debounced: 'prazo', articles: [artigo] };
    render(<KnowledgeBaseSearchPanel onInsertText={vi.fn()} />);
    expect(screen.queryByText('Prazo de entrega')).toBeNull();
    expect(screen.getByTestId('kb-loading')).toBeInTheDocument();
  });
});
