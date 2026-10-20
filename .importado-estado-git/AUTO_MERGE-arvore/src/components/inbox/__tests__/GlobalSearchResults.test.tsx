import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SearchResult } from '../useGlobalSearchData';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => (props: Record<string, unknown>) => {
      const { children, initial, animate, exit, transition, layout, ...rest } = props;
      return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { GlobalSearchResults } from '../search/GlobalSearchResults';

const RESULTADOS: SearchResult[] = [
  {
    id: 'm1', type: 'message', title: 'Foto da fachada', preview: 'segue a foto',
    timestamp: new Date('2026-01-06T10:00:00'), messageType: 'image',
  },
  {
    id: 'c1', type: 'contact', title: 'Ana Souza', preview: '+55 11 99999-0000',
    timestamp: new Date('2026-01-07T12:30:00'),
  },
];

function setup(over: Partial<React.ComponentProps<typeof GlobalSearchResults>> = {}) {
  const props = {
    results: RESULTADOS,
    isLoading: false,
    search: 'ana',
    selectedIndex: -1,
    hasTagSuggestions: false,
    onSelect: vi.fn(),
    ...over,
  };
  const utils = render(<GlobalSearchResults {...props} />);
  return { ...utils, props };
}

beforeEach(() => cleanup());

describe('GlobalSearchResults — carregando', () => {
  it('mostra o indicador de carregamento e nenhum resultado', () => {
    const { container } = setup({ isLoading: true, results: [] });
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.queryByText('Nenhum resultado encontrado')).toBeNull();
    expect(screen.queryByText('Foto da fachada')).toBeNull();
  });
});

describe('GlobalSearchResults — lista de resultados', () => {
  it('conta os resultados no plural', () => {
    setup();
    expect(screen.getByText('2 resultados')).toBeInTheDocument();
  });

  it('usa singular com um único resultado', () => {
    setup({ results: [RESULTADOS[0]] });
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
  });

  it('mostra título, prévia e o rótulo do tipo de cada resultado', () => {
    setup();
    expect(screen.getByText('Foto da fachada')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    // 'message' com messageType image vira o rótulo "Imagem", não "Texto"
    expect(screen.getByText('Imagem')).toBeInTheDocument();
    expect(screen.getByText('Contato')).toBeInTheDocument();
  });

  it('rotula transcrição, ação e CRM corretamente', () => {
    setup({
      results: [
        { id: 't1', type: 'transcription', title: 'Chamada', preview: 'transcrição', timestamp: new Date() },
        { id: 'a1', type: 'action', title: 'Arquivar', preview: 'ação', timestamp: new Date() },
        { id: 'r1', type: 'crm', title: 'Lead', preview: 'crm', timestamp: new Date() },
      ],
    });
    expect(screen.getByText('Transcrição')).toBeInTheDocument();
    expect(screen.getByText('Ação')).toBeInTheDocument();
    expect(screen.getByText('CRM')).toBeInTheDocument();
  });

  it('clicar em um resultado entrega aquele resultado ao onSelect', () => {
    const { props } = setup();
    fireEvent.click(screen.getByText('Ana Souza'));
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', type: 'contact' })
    );
  });

  it('realça o resultado na posição selecionada', () => {
    setup({ selectedIndex: 0 });
    expect(screen.getByText('Foto da fachada').closest('button')).toHaveClass('bg-muted');
  });

  it('não lista nada quando há sugestão de etiquetas', () => {
    const { container } = setup({ hasTagSuggestions: true });
    expect(screen.queryByText('Foto da fachada')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

describe('GlobalSearchResults — vazio', () => {
  it('avisa que não há resultado a partir de 2 caracteres', () => {
    setup({ results: [], search: 'zz' });
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
  });

  it('não mostra o aviso com busca de 1 caractere', () => {
    const { container } = setup({ results: [], search: 'z' });
    expect(screen.queryByText('Nenhum resultado encontrado')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
