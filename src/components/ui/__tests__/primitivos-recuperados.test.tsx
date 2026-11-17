import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../table';
import { useAnnounce } from '../visually-hidden';

/**
 * Três melhorias recuperadas da varredura de branches (bloco C, veredito em
 * `analise-prs/VEREDITOS-BLOCO-C-261117.md`). As duas primeiras são defeito na
 * `main`, não só ausência de recurso.
 */

afterEach(() => cleanup());

describe('TableHead — scope da coluna (acessibilidade)', () => {
  it('traz scope="col" por padrão', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Fila</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow><TableCell>Ana</TableCell><TableCell>Suporte</TableCell></TableRow>
        </TableBody>
      </Table>,
    );
    const cabecalhos = screen.getAllByRole('columnheader');
    expect(cabecalhos).toHaveLength(2);
    // Sem scope, o leitor de tela lê o valor sem dizer de que coluna ele é.
    for (const th of cabecalhos) expect(th.getAttribute('scope')).toBe('col');
  });

  it('o padrão não impede o cabeçalho de LINHA de usar scope="row"', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableHead scope="row">Total</TableHead>
            <TableCell>42</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('rowheader').getAttribute('scope')).toBe('row');
  });
});

describe('useAnnounce — o timer do anúncio é limpo', () => {
  it('um anúncio novo cancela o anterior: vence o último, não o primeiro', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAnnounce());

      act(() => { result.current.announce('primeiro'); });
      act(() => { result.current.announce('segundo'); });
      act(() => { vi.advanceTimersByTime(200); });

      const { Announcer } = result.current;
      render(<Announcer />);
      // Sem cancelar o primeiro agendamento, os dois disparavam e a ordem de
      // chegada decidia — podia sobrar a frase antiga na região aria-live.
      expect(screen.getByText('segundo')).toBeTruthy();
      expect(screen.queryByText('primeiro')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('desmontar antes do prazo não deixa o timer disparar', () => {
    vi.useFakeTimers();
    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => { erros.push(a); };
    try {
      const { result, unmount } = renderHook(() => useAnnounce());
      act(() => { result.current.announce('some antes de aparecer'); });

      unmount();
      // Sem o clearTimeout do desmonte, este avanço chamava setAnnouncement em
      // componente que já saiu.
      act(() => { vi.advanceTimersByTime(500); });

      expect(erros).toHaveLength(0);
    } finally {
      console.error = original;
      vi.useRealTimers();
    }
  });
});
