/**
 * Etapa 167 (plano, linhas 124 e 447; imagem 04, seção 3.4) — rodapé do modal
 * "Nova tarefa": dica "Enter para criar", "Cancelar" e "+ Criar tarefa", com
 * `Enter` no título criando, `Ctrl+Enter` em qualquer campo criando e `Esc`
 * cancelando.
 *
 * O que este arquivo prova, e por quê:
 *  - a dica de teclado existe e os dois botões têm nome acessível (o ícone do
 *    "+" é decorativo, não entra no nome);
 *  - "Criar tarefa" só habilita com título — a mesma regra que o campo usa
 *    para o erro inline;
 *  - `Enter` no título e `Ctrl+Enter` em outro campo criam de verdade: o
 *    INSERT é conferido no cliente Supabase falso e o modal fecha na sonda do
 *    `TasksUiContext`;
 *  - "Cancelar" e `Esc` fecham sem gravar nada.
 */
import { resetSupabaseMock, setWriteResult, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

beforeEach(() => {
  resetSupabaseMock();
  setWriteResult({ data: { id: 'nt-1' }, error: null });
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

function AbrirEMontar() {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      <span data-testid="sonda-modal">{modalOpen ? 'aberto' : 'fechado'}</span>
      {modalOpen && <NewTaskDialog now={NOW} />}
    </>
  );
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirEMontar />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
}

function titulo() {
  return screen.getByTestId('new-task-title') as HTMLInputElement;
}
function sonda() {
  return screen.getByTestId('sonda-modal');
}
function criarBtn() {
  return screen.getByRole('button', { name: 'Criar tarefa' }) as HTMLButtonElement;
}

describe('NewTaskDialog — rodapé do modal (etapa 167)', () => {
  it('mostra a dica "Enter para criar" e os botões "Cancelar" e "Criar tarefa"', () => {
    montar();

    expect(screen.getByTestId('nt-dica')).toHaveTextContent('Enter para criar');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(criarBtn()).toBeInTheDocument();
  });

  it('"Criar tarefa" só habilita com título (mesma regra do erro inline)', () => {
    montar();

    expect(criarBtn()).toBeDisabled();

    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });
    expect(criarBtn()).toBeEnabled();

    fireEvent.change(titulo(), { target: { value: '   ' } });
    expect(criarBtn()).toBeDisabled();
  });

  it('Enter no título cria a tarefa e fecha o modal', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.keyDown(titulo(), { key: 'Enter' });

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(1));
    expect(supabaseMock.insert.mock.calls[0][0]).toMatchObject({
      title: 'Ligar para Ana',
      status: 'backlog',
    });
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
  });

  it('Ctrl+Enter em outro campo também cria', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.keyDown(screen.getByTestId('new-task-prazo-data'), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
  });

  it('Enter sem título não cria: mostra o erro inline e nada vai ao banco', async () => {
    montar();

    fireEvent.keyDown(titulo(), { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o título da tarefa.');
    expect(supabaseMock.insert).not.toHaveBeenCalled();
    expect(sonda()).toHaveTextContent('aberto');
  });

  it('"Cancelar" com rascunho pede confirmação e só descarta depois de confirmar', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Etapa 170: com título digitado o modal NÃO fecha sozinho.
    expect(await screen.findByTestId('nt-descarte')).toBeInTheDocument();
    expect(sonda()).toHaveTextContent('aberto');

    fireEvent.click(screen.getByTestId('nt-descarte-confirmar'));

    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });

  it('Esc com rascunho pede confirmação e "Continuar editando" preserva o texto', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(await screen.findByTestId('nt-descarte')).toBeInTheDocument();
    expect(sonda()).toHaveTextContent('aberto');

    fireEvent.click(screen.getByTestId('nt-descarte-continuar'));

    await waitFor(() => expect(screen.queryByTestId('nt-descarte')).toBeNull());
    expect(titulo().value).toBe('Ligar para Ana');
    expect(sonda()).toHaveTextContent('aberto');
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });
});
