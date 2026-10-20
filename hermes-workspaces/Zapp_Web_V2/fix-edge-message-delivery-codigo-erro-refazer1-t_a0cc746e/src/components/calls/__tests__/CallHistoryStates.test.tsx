import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallHistoryEmpty, CallHistoryError, CallHistorySkeleton } from '../CallHistoryStates';
import { CallsPagination } from '../CallsPagination';
import { janelaDePaginas } from '../paginas';

describe('janelaDePaginas (T53)', () => {
  it('mostra no maximo 7 paginas', () => {
    expect(janelaDePaginas(1, 40)).toHaveLength(7);
    expect(janelaDePaginas(20, 40)).toHaveLength(7);
    expect(janelaDePaginas(40, 40)).toHaveLength(7);
  });

  it('lista todas quando cabem', () => {
    expect(janelaDePaginas(1, 3)).toEqual([1, 2, 3]);
  });

  it('a pagina atual esta sempre dentro da janela', () => {
    for (const p of [1, 2, 15, 39, 40]) {
      expect(janelaDePaginas(p, 40)).toContain(p);
    }
  });
});

describe('CallsPagination (T53)', () => {
  it('marca a pagina atual com aria-current', () => {
    render(<CallsPagination page={3} pages={10} onPageChange={() => {}} />);
    const atual = screen.getByText('3');
    expect(atual.getAttribute('aria-current')).toBe('page');
  });

  it('some quando ha uma pagina so', () => {
    const { container } = render(<CallsPagination page={1} pages={1} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('estados do corpo do historico (T53)', () => {
  it('carregando: 8 linhas com a altura da linha real (57)', () => {
    render(<CallHistorySkeleton />);
    const corpo = screen.getByTestId('tel-history-loading');
    expect(corpo.children).toHaveLength(8);
    expect(corpo.firstElementChild?.className).toContain('h-[57px]');
  });

  it('vazio por filtro oferece limpar filtros', () => {
    const limpar = vi.fn();
    render(<CallHistoryEmpty porFiltro onLimparFiltros={limpar} onNovaLigacao={() => {}} />);
    screen.getByText('Limpar filtros').click();
    expect(limpar).toHaveBeenCalled();
  });

  it('vazio total oferece fazer uma ligacao', () => {
    const ligar = vi.fn();
    render(<CallHistoryEmpty porFiltro={false} onLimparFiltros={() => {}} onNovaLigacao={ligar} />);
    screen.getByText('Fazer uma ligação').click();
    expect(ligar).toHaveBeenCalled();
  });

  it('erro oferece tentar novamente', () => {
    const tentar = vi.fn();
    render(<CallHistoryError onTentarNovamente={tentar} />);
    screen.getByText('Tentar novamente').click();
    expect(tentar).toHaveBeenCalled();
  });
});
