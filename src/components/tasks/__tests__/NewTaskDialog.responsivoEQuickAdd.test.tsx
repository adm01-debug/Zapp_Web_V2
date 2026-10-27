/**
 * Etapas 169 e 171 (plano, seção 3). O corte de largura do acordeão é CSS e o
 * jsdom não faz layout; o que dá para provar aqui é o comportamento: o gatilho
 * controla `aria-expanded` sobre a prévia REAL (169) e o ⋯ do QuickAdd abre o
 * modal já preenchido (171).
 */
import { resetSupabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  contatos: [{ id: 'c1', name: 'Ana Souza', phone: '11999998888', avatar_url: null }],
}));

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({
    contacts: h.contatos,
    loading: false,
    handleSearchChange: () => {},
  }),
}));

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { QuickAdd } from '@/components/tasks/shared/QuickAdd';
import { esquecerRascunhoDaCaptura } from '@/components/tasks/shared/new-task/rascunhoDaCaptura';

// Terça-feira, 13/10/2026, 12:00 locais.
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

beforeEach(() => {
  resetSupabaseMock();
  // O rascunho do QuickAdd é um canal de vida curta: cada caso começa limpo.
  esquecerRascunhoDaCaptura();
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

/** Botão de abertura + sonda do contexto, como no módulo real. */
function AbrirModal() {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      {modalOpen && <NewTaskDialog now={NOW} />}
    </>
  );
}

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

describe('NewTaskDialog — responsivo: prévia em acordeão (etapa 169)', () => {
  function montarModal() {
    render(
      <QueryClientProvider client={qc()}>
        <TasksUiProvider>
          <AbrirModal />
        </TasksUiProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
  }

  it('o gatilho da prévia controla o acordeão por aria-expanded', () => {
    montarModal();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
  });

  it('o painel do acordeão embrulha a prévia real (não um resumo)', () => {
    montarModal();

    const painel = screen.getByTestId('nt-previa-painel');
    expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();

    // Aberto ou fechado, o gatilho e a prévia convivem no mesmo ponto do modal.
    fireEvent.click(screen.getByTestId('nt-previa-gatilho'));
    expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();
  });
});

describe('QuickAdd — "Mais opções…" abre o modal pré-preenchido (etapa 171)', () => {
  function montar() {
    function App() {
      const { modalOpen, openModal } = useTasksUi();
      return (
        <>
          <QuickAdd onAdd={async () => {}} compact />
          {/* O mesmo botão do cabeçalho do módulo: abre o modal VAZIO. */}
          <button type="button" onClick={openModal}>abrir modal</button>
          {modalOpen && <NewTaskDialog now={NOW} />}
        </>
      );
    }
    render(
      <QueryClientProvider client={qc()}>
        <TasksUiProvider>
          <App />
        </TasksUiProvider>
      </QueryClientProvider>,
    );
  }

  it('o ⋯ do QuickAdd do módulo abre o modal com o título digitado na captura', async () => {
    montar();

    fireEvent.change(screen.getByTestId('quick-add-input'), {
      target: { value: 'Ligar para Ana sobre o orçamento' },
    });

    fireEvent.click(screen.getByTestId('quick-add-more'));

    await waitFor(() => expect(screen.getByTestId('new-task-dialog')).toBeInTheDocument());

    const titulo = screen.getByTestId('new-task-title') as HTMLInputElement;
    expect(titulo.value).toBe('Ligar para Ana sobre o orçamento');
  });

  it('o próximo modal aberto pelo cabeçalho nasce vazio (o rascunho foi consumido)', async () => {
    montar();

    fireEvent.change(screen.getByTestId('quick-add-input'), {
      target: { value: 'Rascunho que vai para o modal' },
    });
    fireEvent.click(screen.getByTestId('quick-add-more'));
    await waitFor(() => expect(screen.getByTestId('new-task-dialog')).toBeInTheDocument());

    // Fecha o modal pelo botão "Cancelar" (com título pede confirmação) e reabre.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(await screen.findByTestId('nt-descarte-confirmar'));
    await waitFor(() => expect(screen.queryByTestId('new-task-dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));

    await waitFor(() => expect(screen.getByTestId('new-task-dialog')).toBeInTheDocument());
    const titulo = screen.getByTestId('new-task-title') as HTMLInputElement;
    expect(titulo.value).toBe('');
  });
});
