import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ResultType, DateFilter, MediaTypeFilter } from '../useGlobalSearchData';

const crm = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => crm.enabled,
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: new Proxy({}, {
        get: (_t, tag: string) => (props: Record<string, unknown>) => {
          const { children, initial, animate, exit, transition, layout, ...rest } = props;
          return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
        },
      }),
      AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      useReducedMotion: vi.fn(() => null),
  };
});

import { GlobalSearchFilters } from '../search/GlobalSearchFilters';

interface Props {
  show: boolean;
  activeTypes: Set<ResultType>;
  dateFilter: DateFilter;
  mediaTypeFilter: MediaTypeFilter;
  activeFiltersCount: number;
  onToggleType: (t: ResultType) => void;
  onSetDateFilter: (f: DateFilter) => void;
  onSetMediaTypeFilter: (f: MediaTypeFilter) => void;
  onClearFilters: () => void;
}

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    show: true,
    activeTypes: new Set<ResultType>(),
    dateFilter: 'all',
    mediaTypeFilter: 'all',
    activeFiltersCount: 0,
    onToggleType: vi.fn(),
    onSetDateFilter: vi.fn(),
    onSetMediaTypeFilter: vi.fn(),
    onClearFilters: vi.fn(),
    ...over,
  };
  render(<GlobalSearchFilters {...props} />);
  return props;
}

beforeEach(() => {
  crm.enabled = false;
  cleanup();
});

describe('GlobalSearchFilters — mostra e esconde', () => {
  it('não renderiza nada quando show é false', () => {
    setup({ show: false });
    expect(screen.queryByText('Tipo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Textos' })).toBeNull();
  });

  it('mostra os três grupos de filtro quando show é true', () => {
    setup();
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Período')).toBeInTheDocument();
    expect(screen.getByText('Tipo de Mídia')).toBeInTheDocument();
  });
});

describe('GlobalSearchFilters — filtro por tipo', () => {
  it('clicar em Textos pede o tipo message', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Textos' }));
    expect(props.onToggleType).toHaveBeenCalledWith('message');
  });

  it('clicar em Ações pede o tipo action', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }));
    expect(props.onToggleType).toHaveBeenCalledWith('action');
  });

  it('clicar em Contatos pede o tipo contact', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(props.onToggleType).toHaveBeenCalledWith('contact');
  });

  it('marca como pressionado o tipo que está ativo', () => {
    setup({ activeTypes: new Set<ResultType>(['message']) });
    expect(screen.getByRole('button', { name: 'Textos' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('button', { name: 'Ações' })).toHaveAttribute('data-state', 'off');
  });
});

describe('GlobalSearchFilters — CRM depende da integração', () => {
  it('não mostra o filtro de CRM quando a integração está desligada', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'CRM' })).toBeNull();
  });

  it('mostra e aciona o filtro de CRM quando a integração está ligada', () => {
    crm.enabled = true;
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'CRM' }));
    expect(props.onToggleType).toHaveBeenCalledWith('crm');
  });
});

describe('GlobalSearchFilters — tipo de mídia', () => {
  it('clicar em Imagens seleciona image', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Imagens' }));
    expect(props.onSetMediaTypeFilter).toHaveBeenCalledWith('image');
  });

  it('clicar de novo no filtro de mídia já ativo volta para all', () => {
    const props = setup({ mediaTypeFilter: 'image' });
    fireEvent.click(screen.getByRole('button', { name: 'Imagens' }));
    expect(props.onSetMediaTypeFilter).toHaveBeenCalledWith('all');
  });

  it('clicar em Todos seleciona all', () => {
    const props = setup({ mediaTypeFilter: 'video' });
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(props.onSetMediaTypeFilter).toHaveBeenCalledWith('all');
  });

  it('oferece vídeo, áudio, documento e link', () => {
    setup();
    ['Vídeos', 'Áudios', 'Documentos', 'Links'].forEach((nome) => {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument();
    });
  });
});

describe('GlobalSearchFilters — limpar filtros', () => {
  it('esconde o botão de limpar quando não há filtro ativo', () => {
    setup({ activeFiltersCount: 0 });
    expect(screen.queryByRole('button', { name: /Limpar filtros/ })).toBeNull();
  });

  it('mostra e aciona o botão de limpar quando há filtro ativo', () => {
    const props = setup({ activeFiltersCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/ }));
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
  });
});
