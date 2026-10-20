/**
 * Etapa 164 — bloco "Destino da tarefa" do modal Nova tarefa (fixo, D10).
 *
 * Plano, seção 3.4 (imagem 04), linha 121:
 *   | "A tarefa será criada na Caixa de entrada." | FALTA | 164 |
 * e decisão D10 (seção 6): o destino da tarefa nova é SEMPRE a Caixa de entrada.
 *
 * A prova monta o modal REAL (`NewTaskDialog`), não um bloco solto: confere que
 * o aviso aparece dentro do diálogo, com o texto exato, sem nenhum controle de
 * escolha de destino (D10) e com o ícone decorativo (fora do nome acessível).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const TEXTO = 'A tarefa será criada na Caixa de entrada.';

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => cleanup());

function renderDialog() {
  return render(<NewTaskDialog open onOpenChange={vi.fn()} />);
}

describe('NewTaskDialog — destino da tarefa (etapa 164)', () => {
  it('mostra o aviso fixo com o texto exato, montado dentro do modal', () => {
    renderDialog();

    const bloco = screen.getByTestId('new-task-destination');
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
    // Está no modal de verdade, não solto na página.
    expect(screen.getByRole('dialog')).toContainElement(bloco);
  });

  it('é fixo conforme D10: nenhum seletor de destino', () => {
    renderDialog();

    const bloco = screen.getByTestId('new-task-destination');
    // Nenhum controle de escolha dentro do bloco.
    expect(
      bloco.querySelector(
        'button, select, input, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="menu"]',
      ),
    ).toBeNull();
    // E nada no modal oferece "destino" como opção.
    expect(screen.queryByRole('combobox', { name: /destino/i })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: /destino/i })).toBeNull();
  });

  it('o ícone é decorativo: escondido do leitor de tela', () => {
    renderDialog();

    const bloco = screen.getByTestId('new-task-destination');
    const icone = bloco.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('não tem violação estrutural de acessibilidade (axe)', async () => {
    const { container } = renderDialog();

    expect(await axe(container)).toHaveNoViolations();
  });
});
