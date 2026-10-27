/**
 * Etapa 168, captura otimista ([refazer 1] ponto 1) — o modal fecha com o
 * INSERT ainda PENDENTE, não depois dele.
 *
 * Por que um mock de hook aqui (e não o Supabase falso): o que está em prova
 * é a ORDEM no diálogo (`closeModal()` antes de aguardar `createAndGetId`),
 * então a promessa do INSERT precisa ficar pendente sob controle do teste —
 * o cliente falso resolve na hora e não distingue as duas ordens. O caminho
 * real do INSERT (payload, destino, Desfazer) continua provado pelo
 * `NewTaskDialog.criacao.test.tsx`, sem mock de hook.
 */
import { resetSupabaseMock, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Promessa do INSERT sob controle do teste: `resolveCriar` a cumpre quando o
// teste mandar; enquanto isso ela fica pendente de verdade.
const h = vi.hoisted(() => ({
  chamadas: [] as unknown[],
  resolver: null as null | ((id: string | null) => void),
}));

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  TAREFA_CRIADA_TOAST_ID: 'tarefa-criada',
  useMyWorkItems: () => ({
    createAndGetId: (input: unknown) => {
      h.chamadas.push(input);
      return new Promise<string | null>((resolve) => {
        h.resolver = resolve;
      });
    },
    cancel: vi.fn(),
    refetch: vi.fn(async () => ({ data: [] })),
  }),
}));

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

beforeEach(() => {
  resetSupabaseMock();
  h.chamadas = [];
  h.resolver = null;
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

describe('NewTaskDialog — modal fecha com o INSERT pendente (etapa 168)', () => {
  it('a sonda já está "fechado" com a promessa do INSERT não resolvida', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    // O INSERT foi disparado (payload real vai junto)...
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    expect(h.chamadas[0]).toMatchObject({ title: 'Ligar para Ana', status: 'backlog' });
    // ...mas a promessa continua pendente — e o modal já saiu da frente.
    // Com o código recusado (fecha depois do `await`), a sonda fica "aberto"
    // aqui até o timeout: este `waitFor` é o que o distingue.
    expect(h.resolver).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId('sonda-modal')).toHaveTextContent('fechado'));
  });

  it('quando o INSERT resolve, o toast com "Desfazer" entra no lugar do simples', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(h.resolver).not.toBeNull());
    h.resolver!('nt-1');

    await waitFor(() => expect(supabaseMock.undoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tarefa criada', onUndo: expect.any(Function) }),
    ));
    expect(supabaseMock.toast.dismiss).toHaveBeenCalledWith('tarefa-criada');
  });
});
