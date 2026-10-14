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
import { resetSupabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { QuickAdd } from '@/components/tasks/shared/QuickAdd';

const TEXTO = 'A tarefa será criada na Caixa de entrada.';

beforeEach(() => {
  resetSupabaseMock();
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

/** Monta o modal pelo MESMO caminho do módulo: `modalOpen` no `TasksUiContext`. */
function AbrirModal() {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      {modalOpen && <NewTaskDialog />}
    </>
  );
}

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirModal />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
  return utils;
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


describe('NewTaskDialog — responsivo (169), descarte (170) e ⋯ do QuickAdd (171)', () => {
  it('169: a prévia vira acordeão por aria-expanded sem perder a prévia real', () => {
    renderDialog();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    const painel = screen.getByTestId('nt-previa-painel');
    expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();

    fireEvent.click(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();
  });

  it('170: fechar com título digitado pede confirmação e "Continuar editando" preserva o texto', async () => {
    renderDialog();
    const titulo = screen.getByTestId('new-task-title') as HTMLInputElement;
    fireEvent.change(titulo, { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByTestId('nt-descarte')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nt-descarte-continuar'));
    await waitFor(() => expect(screen.queryByTestId('nt-descarte')).toBeNull());
    expect(titulo.value).toBe('Ligar para Ana');
  });

  it('171: o ⋯ do QuickAdd abre o modal já preenchido com o texto da captura', async () => {
    function App() {
      const { modalOpen, openModal } = useTasksUi();
      return (
        <>
          <QuickAdd onAdd={async () => {}} compact />
          <button type="button" onClick={openModal}>abrir modal</button>
          {modalOpen && <NewTaskDialog />}
        </>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <TasksUiProvider>
          <App />
        </TasksUiProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'Ligar para Ana sobre o orçamento' } });
    fireEvent.click(screen.getByTestId('quick-add-more'));

    await waitFor(() => expect(screen.getByTestId('new-task-dialog')).toBeInTheDocument());
    expect((screen.getByTestId('new-task-title') as HTMLInputElement).value).toBe('Ligar para Ana sobre o orçamento');
  });
});
