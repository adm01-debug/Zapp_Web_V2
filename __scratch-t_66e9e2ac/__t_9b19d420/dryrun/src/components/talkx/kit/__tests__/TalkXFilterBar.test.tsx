import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalkXFilterBar, FilterBarV2 } from '../filters';
import { resolvePeriodRange } from '../periods';

const filtros = [
  {
    key: 'status',
    label: 'Status',
    allLabel: 'Todos os status',
    options: [
      { value: 'aberto', label: 'Aberto' },
      { value: 'fechado', label: 'Fechado' },
    ],
  },
];

describe('TalkXFilterBar (barra única)', () => {
  it('(1) o gatilho mostra "Todos os status" quando o valor é all', () => {
    render(<TalkXFilterBar filters={filtros} values={{ status: 'all' }} onFilter={() => {}} />);
    expect(screen.getByText('Todos os status')).toBeTruthy();
  });

  it('(2) escolher "7 dias" chama onPeriodChange com intervalo from/to', () => {
    const onPeriodChange = vi.fn();
    render(<TalkXFilterBar onPeriodChange={onPeriodChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '7 dias' }));

    expect(onPeriodChange).toHaveBeenCalledTimes(1);
    const [chave, range] = onPeriodChange.mock.calls[0];
    expect(chave).toBe('7d');
    expect(range).toBeTruthy();
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
    expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());

    // O cálculo também está exposto de forma pura e verificável.
    const r = resolvePeriodRange('7d');
    expect(r).not.toBeNull();
    expect(r!.from.getTime()).toBeLessThanOrEqual(r!.to.getTime());
  });

  it('(3) "Limpar filtros" passa de desabilitado a habilitado quando um filtro fica ativo', () => {
    const { rerender } = render(<TalkXFilterBar hasActive={false} onClear={() => {}} />);
    const limpar = () => screen.getByRole('button', { name: 'Limpar filtros' }) as HTMLButtonElement;

    expect(limpar().disabled).toBe(true);

    rerender(<TalkXFilterBar hasActive onClear={() => {}} />);
    expect(limpar().disabled).toBe(false);
  });

  it('(4) clique no botão "Atualizar" chama onRefresh', () => {
    const onRefresh = vi.fn();
    render(<TalkXFilterBar onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('(extra) FilterBarV2 continua exportado como alias da barra única', () => {
    expect(FilterBarV2).toBe(TalkXFilterBar);
  });
});
