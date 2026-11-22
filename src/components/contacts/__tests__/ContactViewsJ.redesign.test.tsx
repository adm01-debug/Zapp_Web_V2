import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/**
 * ZD-090..093 (Fase J) — as três visões extras (Pipeline, Mapa e Analytics)
 * passam a usar as mesmas cascas do design: `.zc-alt-view` (cartão de 22px,
 * título Outfit 22px, legenda `--contacts-quiet`) e `.zc-empty` (445px de
 * altura mínima no estado vazio). Os contratos de comportamento seguem nos
 * testes originais de cada componente; aqui se prova só a casca e o conteúdo
 * novo (chips de região e barras horizontais do analytics).
 */

vi.mock('@hello-pangea/dnd', async () => {
  const { createElement, Fragment } = await import('react');
  const provided = { innerRef: () => {}, droppableProps: {}, draggableProps: {}, dragHandleProps: {}, placeholder: null };
  return {
    DragDropContext: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
      createElement(Fragment, null, children(provided, {})),
    Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
      createElement(Fragment, null, children(provided, {})),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// O mapa real depende do Mapbox: aqui só a casca e os chips importam.
vi.mock('../ContactRegionMap', () => ({
  ContactRegionMap: () => <div data-map-stub="" />,
}));

import { ContactKanbanView } from '../ContactKanbanView';
import { ContactMapView } from '../ContactMapView';
import { ContactAnalyticsDashboard } from '../ContactAnalyticsDashboard';

const PIPELINE_CONTACT = {
  id: 'c1', name: 'Fulano', surname: 'de Tal', phone: '5511999999999',
  company: 'Empresa A', contact_type: 'cliente',
};

describe('Fase J — casca das visões extras', () => {
  it('Pipeline usa a casca do design com título, legenda e contagem por etapa', () => {
    render(<ContactKanbanView contacts={[PIPELINE_CONTACT]} onContactClick={() => {}} />);
    const casca = screen.getByTestId('contact-kanban-view');
    expect(casca.className).toContain('min-h-[430px]');
    expect(casca.className).toContain('rounded-[12px]');
    expect(within(casca).getByRole('heading', { name: 'Pipeline' })).toBeInTheDocument();
    expect(within(casca).getByText(/arraste o card para mudar a etapa comercial/i)).toBeInTheDocument();
    // A etapa que recebe o contato publica a contagem no cabeçalho da lane.
    expect(within(casca).getByText('· 1')).toBeInTheDocument();
    // As seis etapas canônicas continuam todas na tela.
    for (const etapa of ['Clientes', 'Fornecedores', 'Transportadoras', 'Colaboradores', 'Prestadores', 'Parceiros']) {
      expect(within(casca).getByText(etapa)).toBeInTheDocument();
    }
  });

  it('Pipeline vazio mantém o cartão de estado vazio e nenhuma lane', () => {
    render(<ContactKanbanView contacts={[]} onContactClick={() => {}} />);
    expect(screen.getByTestId('contact-kanban-empty')).toBeInTheDocument();
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument();
  });

  it('Mapa usa a casca do design e lista as regiões em chips quando há contatos', () => {
    render(<ContactMapView contacts={[PIPELINE_CONTACT]} />);
    const chips = screen.getByRole('list', { name: 'Regiões carregadas' });
    expect(chips.className).toContain('flex-wrap');
    expect(within(chips).getByText(/São Paulo - SP · 1/)).toBeInTheDocument();
  });

  it('Mapa vazio usa o cartão `.zc-empty` de 445px com título e texto', () => {
    render(<ContactMapView contacts={[]} />);
    const vazio = screen.getByTestId('contact-mapa-empty');
    expect(vazio.className).toContain('min-h-[445px]');
    expect(within(vazio).getByText('Sem coordenadas')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Regiões carregadas' })).not.toBeInTheDocument();
  });
});

describe('Fase J — analytics em barras do design', () => {
  const pagina = [
    { id: 'a', name: 'A', contact_type: 'cliente', company: 'Empresa A', tags: ['vip'], created_at: new Date().toISOString() },
    { id: 'b', name: 'B', contact_type: 'cliente', company: null, tags: [], created_at: new Date().toISOString() },
    { id: 'c', name: 'C', contact_type: 'fornecedor', company: null, tags: [], created_at: new Date().toISOString() },
  ];

  it('usa a casca do design e publica o título com a legenda de escopo', () => {
    const { container } = render(<ContactAnalyticsDashboard contacts={pagina} />);
    expect(container.firstElementChild?.className).toContain('min-h-[430px]');
    expect(screen.getByRole('heading', { name: 'Analytics de Contatos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Distribuição por Tipo' })).toBeInTheDocument();
  });

  it('ordena as barras por contagem e mostra o número no fim da linha', () => {
    render(<ContactAnalyticsDashboard contacts={pagina} />);
    const linhas = screen.getAllByTitle(/de 3 \(/);
    // Cliente (2) vem antes de Fornecedor (1) e soma 100% da página.
    expect(linhas[0]).toHaveAttribute('title', '2 de 3 (67%)');
    expect(linhas[1]).toHaveAttribute('title', '1 de 3 (33%)');
  });

  it('barra proporcional usa o token azul do módulo, não cor fixa', () => {
    render(<ContactAnalyticsDashboard contacts={pagina} />);
    const barras = screen.getAllByTitle(/de 3 \(/);
    expect(barras[0].className).toContain('bg-[hsl(var(--contacts-blue))]');
  });
});