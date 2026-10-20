/**
 * R2-QUE-007 (#454) — Período personalizado aceita início posterior ao fim.
 *
 * Prova no componente REAL (PeriodSelector), com o relógio fixado, que o
 * calendário "Data inicial" passa a bloquear datas posteriores ao fim já
 * escolhido — antes o início podia ficar depois do fim e o "Aplicar" gravava
 * um intervalo invertido. O caminho válido (início antes do fim) continua
 * funcionando.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodSelector } from '../PeriodSelector';

// Relógio fixo: 15/10/2026, para o calendário ser determinístico.
const HOJE = new Date(2026, 9, 15);

function openCustomPopover() {
  const trigger = screen.getByRole('button', { name: /Últimos 7 dias/ });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  fireEvent.click(screen.getAllByText(/Período personalizado/)[0]);
}

function openField(label: string) {
  fireEvent.pointerDown(screen.getByText(label));
  fireEvent.click(screen.getByText(label));
}

function dayButton(text: string): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[name="day"]')
  ).filter((b) => b.textContent?.trim() === text);
  const day = buttons[buttons.length - 1];
  if (!day) throw new Error(`Dia "${text}" não encontrado no calendário`);
  return day;
}

function renderSelector(onChange: (p: string, r: { from: Date; to: Date }) => void) {
  return render(
    <PeriodSelector
      value="7d"
      dateRange={{ from: new Date(2026, 9, 10), to: HOJE }}
      onChange={onChange as never}
    />
  );
}

describe('PeriodSelector — período personalizado', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não aceita início posterior ao fim', () => {
    const onChange = vi.fn();
    renderSelector(onChange);
    openCustomPopover();

    // Define o FIM em 12/10.
    openField('15/10/2026');
    fireEvent.click(dayButton('12'));

    // Tenta definir o INÍCIO em 14/10 (posterior ao fim). Deve estar bloqueado.
    openField('10/10/2026');
    const dia14 = dayButton('14');
    expect(dia14).toBeDisabled();
    fireEvent.click(dia14);

    // Aplicar não pode gravar um intervalo invertido.
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    const invertidas = onChange.mock.calls.filter(
      ([, range]) => (range.from as Date).getTime() > (range.to as Date).getTime()
    );
    expect(invertidas).toHaveLength(0);
    expect(onChange).toHaveBeenCalledWith('custom', { from: new Date(2026, 9, 10), to: new Date(2026, 9, 12) });
  });

  it('continua aceitando início anterior ao fim', () => {
    const onChange = vi.fn();
    renderSelector(onChange);
    openCustomPopover();

    // Fim em 12/10, início em 08/10 (válido).
    openField('15/10/2026');
    fireEvent.click(dayButton('12'));
    openField('10/10/2026');
    const dia08 = dayButton('8');
    expect(dia08).not.toBeDisabled();
    fireEvent.click(dia08);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onChange).toHaveBeenCalledWith('custom', { from: new Date(2026, 9, 8), to: new Date(2026, 9, 12) });
  });
});
