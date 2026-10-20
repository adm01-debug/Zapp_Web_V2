/**
 * T16 (barra de captura) — etapas 040, 042, 043 e 045 do plano do design.
 *
 * 040: placeholder "Capturar uma tarefa…", dica "Enter para criar" à direita
 *      e altura de 48 px.
 * 042: chips rápidos aparecem quando a captura recebe foco; continuam à vista
 *      quando o foco anda do campo para um chip (Tab) e somem quando a linha
 *      perde o foco; a dica sai de cena com o campo focado (segue no DOM);
 *      todo chip tem alvo de 40 px.
 * 043: depois de criar, o foco volta ao campo.
 * 045: vazio de filtro usa "Nenhum resultado" e oferece saída em um clique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../shared/ContactCombobox', () => ({
  ContactCombobox: ({ testId }: { testId?: string }) => <button type="button" data-testid={testId} />,
}));

import { QuickAdd } from '../shared/QuickAdd';
import { TasksEmptyState } from '../TasksEmptyState';

function montar(props: Partial<Parameters<typeof QuickAdd>[0]> = {}) {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(<QuickAdd onAdd={onAdd} {...props} />);
  return { onAdd, input: screen.getByTestId('quick-add-input') as HTMLInputElement };
}

/** Altura garantida pela classe aplicada, em px, pela régua do Tailwind (n*4px).
 *  Traduz EXATAMENTE o que o navegador aplica: `h-7` = 28 px (reprova em 40) e
 *  `min-h-10` = 40 px (passa). É o mesmo idioma aceito no teste do Quadro
 *  (`alvoGarantidoPx`, quadroCapturaConcluidoToggleVazios.test.tsx). */
function alturaGarantidaPx(el: Element): number {
  let px = 0;
  for (const c of el.className.split(/\s+/)) {
    const m = c.match(/^(?:min-)?h-(.+)$/);
    if (!m) continue;
    const v = m[1];
    const n = v.startsWith('[') && v.endsWith('px]')
      ? parseFloat(v.slice(1, -3))
      : /^[0-9.]+$/.test(v) ? parseFloat(v) * 4 : NaN;
    if (!Number.isNaN(n)) px = Math.max(px, n);
  }
  return px;
}

describe('barra de captura (etapas 040/042/043)', () => {
  beforeEach(() => cleanup());

  it('Etapa 040: placeholder, dica "Enter para criar" e altura de 48 px', () => {
    const { input } = montar();

    expect(input.placeholder).toBe('Capturar uma tarefa…');
    expect(screen.getByTestId('quick-add-hint').textContent).toBe('Enter para criar');

    fireEvent.change(input, { target: { value: 'Algo' } });

    expect(screen.queryByTestId('quick-add-hint')).toBeNull();
    expect(screen.getByText('Criar')).toBeTruthy();
    expect((input.parentElement as HTMLElement).className).toContain('h-12');
  });

  it('Etapa 042: os chips rápidos aparecem ao focar o campo', () => {
    const { input } = montar();
    const chips = screen.getByTestId('quick-add-chips');

    expect(chips.hasAttribute('hidden')).toBe(true);

    fireEvent.focus(input);

    expect(chips.hasAttribute('hidden')).toBe(false);
    expect(screen.getByTestId('quick-add-chip-today')).toBeTruthy();
    expect(screen.getByTestId('quick-add-chip-priority')).toBeTruthy();
  });

  it('Etapa 043: ao criar, o foco volta ao campo', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Capturar e seguir' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe('');
  });
});

/**
 * Etapa 042 (refazer 2) — o foco é da LINHA de captura, não só do campo: os
 * chips aparecem com o foco no campo e PRECISAM sobreviver ao Tab que leva o
 * foco para dentro deles (se a barra sumisse nesse instante, o chip focado
 * perderia o `display` e a tecla morreria ali). O jsdom não tem layout: o
 * contrato de classe (`min-h-10` = 40 px) é o mesmo idioma do teste de KPI.
 */
describe('chips da captura com foco no teclado (etapa 042, refazer 2)', () => {
  beforeEach(() => cleanup());

  it('o foco que anda do campo para um chip mantém a barra à vista; sair da linha limpa', () => {
    const { input } = montar();
    const chips = screen.getByTestId('quick-add-chips');
    const chipHoje = screen.getByTestId('quick-add-chip-today');

    expect(chips.hasAttribute('hidden')).toBe(true);

    fireEvent.focus(input);
    expect(chips.hasAttribute('hidden')).toBe(false);

    // Tab: o foco entra no chip (o `focusin` sobe para a linha) — nada some.
    fireEvent.focusIn(chipHoje);
    chipHoje.focus();
    expect(document.activeElement).toBe(chipHoje);
    expect(chips.hasAttribute('hidden')).toBe(false);
    expect(screen.getByTestId('quick-add-chip-priority')).toBeTruthy();

    // Sair da linha (o `focusout` não acha destino dentro dela) limpa a barra.
    fireEvent.focusOut(chipHoje, { relatedTarget: null });
    expect(chips.hasAttribute('hidden')).toBe(true);
  });

  it('a dica "Enter para criar" sai de cena com o campo focado e continua no DOM', () => {
    const { input } = montar();

    const dica = screen.getByTestId('quick-add-hint');
    expect(dica.className).not.toContain('invisible');

    fireEvent.focus(input);

    const dicaFocada = screen.getByTestId('quick-add-hint');
    expect(dicaFocada.textContent).toBe('Enter para criar');
    expect(dicaFocada.className).toContain('invisible');

    fireEvent.focusOut(input, { relatedTarget: null });
    expect(screen.getByTestId('quick-add-hint').className).not.toContain('invisible');
  });

  it('todo chip da captura passa de 40 px de altura', () => {
    montar();

    const chips = [
      'quick-add-chip-today', 'quick-add-chip-tomorrow', 'quick-add-chip-nextweek',
      'quick-add-chip-date', 'quick-add-chip-remind', 'quick-add-chip-priority',
    ];
    for (const id of chips) {
      // O esperado vem da CLASSE APLICADA, resolvida em px pela régua do Tailwind
      // (mesma função do teste do Quadro, `alvoGarantidoPx`) — não de um literal.
      expect(alturaGarantidaPx(screen.getByTestId(id)), id).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('vazio do filtro (etapa 045)', () => {
  beforeEach(() => cleanup());

  it('mostra "Nenhum resultado", a microcopy e a saída em um clique', () => {
    const onClearFilter = vi.fn();
    render(<TasksEmptyState variant="filter" onClearFilter={onClearFilter} />);

    expect(screen.getByText('Nenhum resultado')).toBeTruthy();
    expect(screen.getByText('Ajuste a busca ou os filtros para ver tarefas.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('o vazio geral ("all") não vira "Nenhum resultado"', () => {
    render(<TasksEmptyState variant="all" />);
    expect(screen.getByText('Nada por aqui')).toBeTruthy();
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });
});
