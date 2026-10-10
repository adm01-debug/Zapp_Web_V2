/**
 * X043 — `TalkXTable`: ordenação controlada, seleção restrita à página com
 * indeterminado, reset por `selectionResetKey` e ações de linha (⋮).
 *
 * Cobre os casos 1–5 do aceite. O caso 5 (`fmtRelativeDay`) mora aqui porque o
 * aceite da etapa pede os dois no mesmo arquivo.
 */
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalkXTable } from '../table';
import type { RowAction, TalkXColumn, TalkXSort } from '../table';
import { fmtRelativeDay } from '../format';

// Radix (DropdownMenu) mede o gatilho com ResizeObserver, API ausente no jsdom.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

type Campanha = { id: string; name: string; sent: number };

const ROWS: Campanha[] = [
  { id: 'c1', name: 'Campanha A', sent: 10 },
  { id: 'c2', name: 'Campanha B', sent: 20 },
  { id: 'c3', name: 'Campanha C', sent: 30 },
];

const COLS: TalkXColumn<Campanha>[] = [
  { key: 'name', header: 'Nome', sortKey: 'name', render: (r) => r.name },
  { key: 'sent', header: 'Enviadas', sortKey: 'sent', align: 'right', render: (r) => r.sent },
];

/** Tabela controlada: o estado (ordem/seleção) mora aqui, como num caller real. */
function Harness({
  onSortChange,
  onSelectionChange,
  rowActions,
  rowBusy,
}: {
  onSortChange?: (s: TalkXSort | null) => void;
  onSelectionChange?: (s: Set<string>) => void;
  rowActions?: (r: Campanha) => RowAction[];
  rowBusy?: (r: Campanha) => boolean;
}) {
  const [sort, setSort] = useState<TalkXSort | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resetKey, setResetKey] = useState('pagina-1');
  return (
    <>
      <button type="button" onClick={() => setResetKey((k) => (k === 'pagina-1' ? 'pagina-2' : 'pagina-1'))}>
        Trocar página
      </button>
      <TalkXTable
        columns={COLS}
        rows={ROWS}
        getId={(r) => r.id}
        selectable
        selected={selected}
        onSelectionChange={(s) => {
          setSelected(s);
          onSelectionChange?.(s);
        }}
        selectionResetKey={resetKey}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          onSortChange?.(s);
        }}
        rowActions={rowActions}
        rowLabel={(r) => r.name}
        rowBusy={rowBusy}
      />
    </>
  );
}

describe('X043 — TalkXTable', () => {
  it('(1) clique no cabeçalho alterna asc → desc → sem ordem e ajusta aria-sort', () => {
    const onSortChange = vi.fn();
    render(<Harness onSortChange={onSortChange} />);

    const th = screen.getByRole('columnheader', { name: 'Nome' });
    expect(th).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(screen.getByRole('button', { name: 'Nome' }));
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', dir: 'asc' });

    fireEvent.click(screen.getByRole('button', { name: 'Nome' }));
    expect(th).toHaveAttribute('aria-sort', 'descending');
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', dir: 'desc' });

    fireEvent.click(screen.getByRole('button', { name: 'Nome' }));
    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('(2) "selecionar todas" marca só a página e fica indeterminado com seleção parcial', () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);

    const selectAll = screen.getByLabelText('Selecionar tudo') as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    // parcial: uma linha da página bastou para o cabeçalho ficar indeterminado
    fireEvent.click(screen.getByLabelText('Selecionar Campanha A'));
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['c1']));

    // "selecionar todas" marca exatamente as linhas da página (3), nada além
    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['c1', 'c2', 'c3']));
    const marcados = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked);
    expect(marcados).toHaveLength(4); // cabeçalho + as 3 linhas da página
  });

  it('(3) trocar selectionResetKey zera a seleção', () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText('Selecionar Campanha B'));
    expect((screen.getByLabelText('Selecionar Campanha B') as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trocar página' }));

    expect((screen.getByLabelText('Selecionar Campanha B') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Selecionar tudo') as HTMLInputElement).checked).toBe(false);
  });

  it('(4) item de ação desabilitado NÃO dispara o handler', () => {
    const onVer = vi.fn();
    const onExcluir = vi.fn();
    const actions = (): RowAction[] => [
      { label: 'Ver', onSelect: onVer },
      { label: 'Excluir', onSelect: onExcluir, danger: true, disabled: true },
    ];
    render(<Harness rowActions={actions} />);

    // aria-label do gatilho carrega o nome da linha
    const trigger = screen.getAllByRole('button', { name: /Ações de Campanha/ })[0];
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(onExcluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver' }));
    expect(onVer).toHaveBeenCalledTimes(1);
  });
});

/**
 * Caso 5 do aceite — `fmtRelativeDay` com RELÓGIO FIXO.
 * Relógio congelado EM HORÁRIO LOCAL (sem `Z`): assim as três strings valem em
 * qualquer fuso, e o teste não passaria ou falharia conforme o dia em que roda.
 */
describe('(5) fmtRelativeDay com relógio fixo', () => {
  it('hoje, ontem e anterior — as três formas da spec', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 12, 0, 0));

    expect(fmtRelativeDay('2026-09-20T10:00:00')).toBe('Hoje, 10:00');
    expect(fmtRelativeDay('2026-09-19T16:20:00')).toBe('Ontem, 16:20');
    expect(fmtRelativeDay('2026-09-15T09:30:00')).toBe('15 set, 09:30');

    // sem data e data inválida devolvem o traço, nunca uma string inventada
    expect(fmtRelativeDay(null)).toBe('—');
    expect(fmtRelativeDay('nao-e-data')).toBe('—');

    vi.useRealTimers();
  });
});
