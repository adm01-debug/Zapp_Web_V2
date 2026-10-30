/**
 * Etapas 165 e 166 (plano, linhas 122–123 e 445–446; imagem 04, seção 3.4) —
 * coluna "Prévia da tarefa — Confira antes de criar." e caixa informativa
 * "Prazo é a entrega. Lembrete é o aviso."
 *
 * O que este arquivo prova, e por quê:
 *  - a prévia é o `WorkItemCard` REAL em modo prévia: cada campo do formulário
 *    (título, prioridade, contato, prazo, lembrete) é dirigido pelo componente
 *    real e o teste lê o texto do cartão — sem mock que já traz a resposta;
 *  - o cartão nasce sem título e passa a mostrar o que foi digitado;
 *  - a caixa informativa traz a frase do plano inteira, não um resumo.
 */
import { resetSupabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O serviço falso de contatos. `vi.hoisted` porque o `vi.mock` é içado acima
// das declarações do arquivo.
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

// Terça-feira, 13/10/2026, 12:00 locais.
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

beforeEach(() => {
  resetSupabaseMock();
  h.contatos = [{ id: 'c1', name: 'Ana Souza', phone: '11999998888', avatar_url: null }];
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

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirModal />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
}

function previa() {
  return screen.getByTestId('nt-previa');
}
function titulo() {
  return screen.getByTestId('new-task-title') as HTMLInputElement;
}

describe('NewTaskDialog — prévia da tarefa (etapa 165)', () => {
  it('mostra o rótulo "Prévia da tarefa" e a legenda "Confira antes de criar."', () => {
    montar();

    const caixa = previa();
    expect(within(caixa).getByText('Prévia da tarefa')).toBeInTheDocument();
    expect(within(caixa).getByText('Confira antes de criar.')).toBeInTheDocument();
  });

  it('usa o WorkItemCard real e acompanha o título digitado', () => {
    montar();

    // Sem título escolhido o cartão já existe (vivo) e avisa que está vazio.
    expect(within(previa()).getByText('Sem título')).toBeInTheDocument();

    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana sobre o orçamento' } });

    expect(within(previa()).getByText('Ligar para Ana sobre o orçamento')).toBeInTheDocument();
    expect(within(previa()).queryByText('Sem título')).not.toBeInTheDocument();
  });

  it('acompanha a prioridade escolhida no segmento real', () => {
    montar();

    expect(within(previa()).getByTitle('Prioridade: Média')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Urgente' }));

    expect(within(previa()).getByTitle('Prioridade: Urgente')).toBeInTheDocument();
    expect(within(previa()).queryByTitle('Prioridade: Média')).not.toBeInTheDocument();
  });

  it('mostra o contato escolhido no combobox real (nome)', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-contact'));
    fireEvent.click(screen.getByRole('option', { name: /Ana Souza/ }));

    expect(within(previa()).getByText('Ana Souza')).toBeInTheDocument();
  });

  it('mantém na prévia o contato achado por busca e fora da lista padrão ([refazer 1] ponto 4)', () => {
    montar();

    fireEvent.click(screen.getByTestId('new-task-contact'));
    fireEvent.click(screen.getByRole('option', { name: /Ana Souza/ }));
    expect(within(previa()).getByText('Ana Souza')).toBeInTheDocument();

    // A lista padrão muda (a busca que achou a Ana não é a lista padrão): a
    // prévia lia uma segunda instância da busca e perdia o contato — agora o
    // diálogo guarda o escolhido, então a troca de título (que remontou a
    // tela) não tira a Ana da prévia.
    h.contatos = [];
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    expect(within(previa()).getByText('Ligar para Ana')).toBeInTheDocument();
    expect(within(previa()).getByText('Ana Souza')).toBeInTheDocument();
  });

  it('acompanha o prazo e o lembrete escolhidos nos campos reais', () => {
    montar();

    expect(within(previa()).queryByTitle(/^Prazo:/)).not.toBeInTheDocument();
    expect(within(previa()).queryByTestId('remind-chip')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('new-task-prazo-amanha'));
    fireEvent.click(screen.getByTestId('nt-lembrete-em-1h'));

    expect(within(previa()).getByTitle(/^Prazo:/)).toBeInTheDocument();
    expect(within(previa()).getByTestId('remind-chip')).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade (axe)', async () => {
    montar();
    const resultado = await axe(document.body);
    expect(resultado).toHaveNoViolations();
  });
});

describe('NewTaskDialog — caixa informativa (etapa 166)', () => {
  it('traz a frase do plano inteira (prazo é a entrega, lembrete é o aviso)', () => {
    montar();

    const caixa = screen.getByTestId('nt-info');
    expect(caixa).toHaveTextContent('Prazo é a entrega. Lembrete é o aviso.');
    expect(caixa).toHaveTextContent(
      'O prazo define quando a tarefa deve ser concluída e o lembrete avisa antes.',
    );
  });
});
