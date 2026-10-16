/**
 * Etapa 163 — mensagens de coerência prazo × lembrete do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 443 (e a linha 120 da tabela 3.4):
 *   | 163 | ... "Lembrete programado para antes do prazo." em verde e avisos
 *     âmbar/vermelho nos outros casos, com "Ajustar para 1 h antes do prazo". |
 *
 * Prova pelo componente REAL: monta o `NewTaskDialog` e dirige os dois campos
 * reais (`PrazoField`/`RemindField`) pelo `fireEvent`, como o usuário faria. O
 * banner é lido por papel/texto, e a COR é conferida pelo par de TEXTO que a
 * classe aplica (`text-success`, `--warning-text`, `--destructive-text`) — o
 * mesmo critério dos testes de contraste do módulo (`kpiStripTarefas`,
 * `quadroLarguraFocoContraste`), porque o jsdom não calcula cor.
 *
 * Relógio fixo (13/10/2026 12:00 locais) para o resultado ser determinístico.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

// Terça-feira, 13/10/2026, 12:00 locais.
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

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
  render(<NewTaskDialog open onOpenChange={vi.fn()} now={NOW} />);
}

function banner() {
  return screen.getByTestId('nt-coerencia');
}

function ajustarBtn() {
  return screen.queryByTestId('nt-coerencia-ajustar') as HTMLButtonElement | null;
}

function classeDoBanner() {
  return banner().className;
}

/** Par de TEXTO que a classe do banner aplica — a cor que o tema pinta. */
function parDeTexto(): 'success' | 'warning' | 'destructive' | null {
  const c = classeDoBanner();
  if (/(^|\s)text-success(\s|$)/.test(c)) return 'success';
  if (c.includes('--warning-text')) return 'warning';
  if (c.includes('--destructive-text')) return 'destructive';
  return null;
}

/** Define o prazo pelo campo real (data assume 23:59 locais). */
function definirPrazo(dia: string, hora?: string) {
  fireEvent.change(screen.getByTestId('new-task-prazo-data'), { target: { value: dia } });
  if (hora) fireEvent.change(screen.getByTestId('new-task-prazo-hora'), { target: { value: hora } });
}

/** Define o lembrete pelo campo real (data assume 09:00 locais). */
function definirLembrete(dia: string, hora?: string) {
  fireEvent.change(screen.getByTestId('nt-lembrete-data'), { target: { value: dia } });
  if (hora) fireEvent.change(screen.getByTestId('nt-lembrete-hora'), { target: { value: hora } });
}

describe('NewTaskDialog — coerência prazo × lembrete (etapa 163)', () => {
  it('sem lembrete não há o que conferir: nenhum banner aparece', () => {
    renderDialog();
    definirPrazo('2026-10-20');

    expect(screen.queryByTestId('nt-coerencia')).not.toBeInTheDocument();
  });

  it('VERDE: lembrete no futuro e antes do prazo mostra a confirmação e nenhum ajuste', () => {
    renderDialog();
    definirPrazo('2026-10-20'); // 20/10 23:59
    definirLembrete('2026-10-19', '09:00');

    expect(banner()).toHaveTextContent('Lembrete programado para antes do prazo.');
    expect(banner()).toHaveAttribute('data-state', 'ok');
    expect(banner()).toHaveAttribute('role', 'status');
    expect(parDeTexto()).toBe('success');
    expect(ajustarBtn()).toBeNull();
  });

  it('VERMELHO: lembrete no passado avisa que precisa estar no futuro', () => {
    renderDialog();
    definirPrazo('2026-10-20'); // 20/10 23:59
    definirLembrete('2026-10-12', '09:00'); // antes de "agora" (13/10 12:00)

    expect(banner()).toHaveTextContent('O lembrete precisa estar no futuro.');
    expect(banner()).toHaveAttribute('data-state', 'in_past');
    expect(banner()).toHaveAttribute('role', 'alert');
    expect(parDeTexto()).toBe('destructive');
  });

  it('ÂMBAR: lembrete depois do prazo avisa que precisa ser antes', () => {
    renderDialog();
    definirPrazo('2026-10-20'); // 20/10 23:59
    definirLembrete('2026-10-20', '23:59'); // igual ao prazo não é "antes"

    expect(banner()).toHaveTextContent('O lembrete precisa ser antes do prazo.');
    expect(banner()).toHaveAttribute('data-state', 'after_due');
    expect(banner()).toHaveAttribute('role', 'alert');
    expect(parDeTexto()).toBe('warning');
  });

  it('ÂMBAR: só lembrete, sem prazo, avisa que não há como comparar', () => {
    renderDialog();
    definirLembrete('2026-10-14', '09:00');

    expect(banner()).toHaveTextContent(
      'Sem prazo definido — não há como comparar o lembrete com o prazo.',
    );
    expect(banner()).toHaveAttribute('data-state', 'no_due');
    expect(banner()).toHaveAttribute('role', 'status');
    expect(parDeTexto()).toBe('warning');
  });

  it('AJUSTE: "Ajustar para 1 h antes do prazo" aplica o valor e vira verde', () => {
    renderDialog();
    definirPrazo('2026-10-20'); // 20/10 23:59
    definirLembrete('2026-10-20', '23:59'); // depois do prazo

    const botao = ajustarBtn();
    expect(botao).not.toBeNull();
    expect(botao).toHaveTextContent('Ajustar para 1 h antes do prazo');
    fireEvent.click(botao as HTMLButtonElement);

    // O valor aplicado é o prazo menos 1 h (22:59) e aparece nos campos REAIS.
    expect((screen.getByTestId('nt-lembrete-data') as HTMLInputElement).value).toBe('2026-10-20');
    expect((screen.getByTestId('nt-lembrete-hora') as HTMLInputElement).value).toBe('22:59');
    expect(banner()).toHaveTextContent('Lembrete programado para antes do prazo.');
    expect(banner()).toHaveAttribute('data-state', 'ok');
    // Resolvido o aviso, o atalho sai de cena.
    expect(ajustarBtn()).toBeNull();
  });

  it('AJUSTE: prazo já vencido não oferece atalho (o alvo de 1 h antes cairia no passado)', () => {
    renderDialog();
    definirPrazo('2026-10-12'); // 12/10 23:59 — já passou
    definirLembrete('2026-10-13', '13:00'); // futuro, mas depois do prazo

    expect(banner()).toHaveTextContent('O lembrete precisa ser antes do prazo.');
    expect(ajustarBtn()).toBeNull();
  });
});
