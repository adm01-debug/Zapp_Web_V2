/**
 * Etapa 168 (plano, linhas 448 e 447; imagem 04, seção 3.4) — criação otimista
 * do modal "Nova tarefa": fecha o modal, o item nasce na Caixa de entrada
 * (`status: 'backlog'`, D10) e um toast "Tarefa criada" oferece "Desfazer".
 *
 * O que este arquivo prova, e por quê:
 *  - o INSERT sai pelo caminho do módulo (`useMyWorkItems`), com o destino
 *    fixo da etapa 164: a linha é conferida no cliente Supabase falso, não num
 *    mock de hook que já traria a resposta;
 *  - o modal fecha antes do banco responder (captura otimista) e o "Desfazer"
 *    do toast cancela a tarefa recém-criada (D8) pelo MESMO caminho de update
 *    — o `onUndo` do toast é chamado de verdade, não conferido por presença;
 *  - a troca do toast simples pelo com "Desfazer" dispensa SÓ o aviso da
 *    criação (pelo id): outro toast aberto na hora continua vivo;
 *  - sem título nada vai ao banco: o campo mostra o erro inline.
 */
import { resetSupabaseMock, setSelectResult, setWriteResult, makeTaskRow, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { esquecerRascunhoDaCaptura } from '@/components/tasks/shared/new-task/rascunhoDaCaptura';
import { duePresetISO } from '@/hooks/tasks/workItemPresets';

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

afterEach(() => {
  cleanup();
  // A caixa do rascunho é do módulo (compartilhada entre testes): zera a cada um.
  esquecerRascunhoDaCaptura();
});

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

describe('NewTaskDialog — criação otimista (etapa 168)', () => {
  it('cria na Caixa de entrada, fecha o modal e deixa o Desfazer cancelar', async () => {
    montar();
    // Um aviso de outra ação já está aberto quando a criação acontece.
    supabaseMock.toast.success('aviso de outra ação');
    // O banco já devolve a linha criada na próxima leitura da lista — é o que a
    // Caixa de entrada veria depois do INSERT (o create invalida a consulta).
    setSelectResult({
      data: [makeTaskRow({ id: 'nt-1', title: 'Ligar para Ana sobre o orçamento', status: 'backlog' })],
      error: null,
    });

    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana sobre o orçamento' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }));
    fireEvent.click(screen.getByTestId('new-task-prazo-amanha'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(1));
    expect(supabaseMock.insert.mock.calls[0][0]).toMatchObject({
      title: 'Ligar para Ana sobre o orçamento',
      status: 'backlog',
      priority: 'high',
      due_date: duePresetISO('tomorrow', NOW),
    });

    // Captura otimista: o modal sai da frente assim que o INSERT é disparado.
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));

    // O aviso simples do hook dá lugar ao mesmo texto com "Desfazer" — e SÓ
    // ele é dispensado (pelo id): a chamada sem id, que varreria o aviso de
    // outra ação junto, nunca acontece.
    expect(supabaseMock.toast.dismiss).toHaveBeenCalledWith('tarefa-criada');
    expect(supabaseMock.toast.dismiss).not.toHaveBeenCalledWith();
    expect(supabaseMock.undoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tarefa criada', onUndo: expect.any(Function) }),
    );

    // O "Desfazer" do toast cancela (D8) a tarefa criada — pelo `cancel` do
    // hook, com a linha que a lista devolveu.
    const { onUndo } = supabaseMock.undoToast.mock.calls[0][0];
    await onUndo();

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('sem título não cria: nada vai ao banco e o campo avisa', async () => {
    montar();

    fireEvent.keyDown(titulo(), { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o título da tarefa.');
    expect(supabaseMock.insert).not.toHaveBeenCalled();
    expect(supabaseMock.undoToast).not.toHaveBeenCalled();
    expect(sonda()).toHaveTextContent('aberto');
  });

  it('INSERT recusado não vira "Tarefa criada": o erro fica com o hook e o modal reabre com o rascunho', async () => {
    setWriteResult({ error: { message: 'permission denied' } });
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(supabaseMock.toast.error).toHaveBeenCalled());
    expect(supabaseMock.undoToast).not.toHaveBeenCalled();
    // Captura otimista: o modal fechou antes do banco responder; como o banco
    // recusou, ele REABRE com o que foi digitado (o toast de erro permanece).
    await waitFor(() => expect(sonda()).toHaveTextContent('aberto'));
    expect(titulo().value).toBe('Ligar para Ana');
    expect(screen.getByRole('radio', { name: 'Alta' })).toHaveAttribute('aria-checked', 'true');
    expect(supabaseMock.toast.error).toHaveBeenCalledWith('Erro ao criar tarefa');
  });

  it('depois da recusa o usuário pode tentar de novo sem redigitar e criar normalmente', async () => {
    setWriteResult({ error: { message: 'permission denied' } });
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(supabaseMock.toast.error).toHaveBeenCalled());
    await waitFor(() => expect(sonda()).toHaveTextContent('aberto'));

    setWriteResult({ data: { id: 'nt-1' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
    await waitFor(() => expect(supabaseMock.undoToast).toHaveBeenCalled());
  });

  it('cancelar o modal reaberto descarta o rascunho: o próximo "abrir" nasce vazio', async () => {
    setWriteResult({ error: { message: 'permission denied' } });
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(sonda()).toHaveTextContent('aberto'));
    await waitFor(() => expect(supabaseMock.toast.error).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(await screen.findByTestId('nt-descarte-confirmar'));
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));

    fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
    expect(titulo().value).toBe('');
  });
});
