/**
 * Etapa 170 (plano, linha 126 e 450; imagem 04, seção 3.4) — prévia fiel ao
 * cartão, segmento de prioridade e descarte do rascunho.
 *
 * A decisão D12 (trocar a cor de "Média" para âmbar e a de "Alta" para vermelho)
 * NÃO faz parte desta PR: aqui a cor das pílulas é a que a `main` já tem
 * (`PriorityChip`). Este arquivo prova só o que independe dessa decisão:
 *
 *  - a prévia do modal desenha a pílula com a MESMA classe do `PriorityChip` real
 *    (nenhuma cor própria da prévia) e acompanha a escolha do controle;
 *  - o segmento (item 2) pinta de `primary` só a opção escolhida; as demais ficam
 *    neutras, com o foco visível do sistema, e as setas andam entre as opções;
 *  - o descarte (item 3) pede confirmação com título digitado e fecha direto sem
 *    título — o título continua editável quando o usuário volta atrás.
 */
import { resetSupabaseMock, setWriteResult, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { PrioritySegment } from '@/components/tasks/shared/new-task/PrioritySegment';
import { PriorityChip } from '@/components/tasks/shared/PriorityChip';

const NOW = new Date(2026, 9, 14, 12, 0, 0, 0);

beforeEach(() => {
  resetSupabaseMock();
  setWriteResult({ data: { id: 'nt-170' }, error: null });
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
/** A pílula de prioridade DESENHADA na prévia do modal (title = "Prioridade: X"). */
function pilulaDaPrevia(rotulo: string) {
  const cartao = screen.getByTestId('nt-previa-cartao');
  const pilula = cartao.querySelector(`[title="Prioridade: ${rotulo}"]`);
  expect(pilula, `prévia sem a pílula "${rotulo}"`).not.toBeNull();
  return pilula as HTMLElement;
}

describe('Etapa 170 — a pílula da prévia é o PriorityChip real', () => {
  it('para as 4 prioridades, a pílula da prévia tem a MESMA classe do PriorityChip (sem cor própria)', () => {
    montar();

    const ROTULOS = [
      ['low', 'Baixa'],
      ['medium', 'Média'],
      ['high', 'Alta'],
      ['urgent', 'Urgente'],
    ] as const;

    for (const [prioridade, rotulo] of ROTULOS) {
      fireEvent.click(screen.getByRole('radio', { name: rotulo }));

      const pilula = pilulaDaPrevia(rotulo);
      // Referência: o chip compacto que o cartão da lista desenha na `main`.
      const { container } = render(<PriorityChip priority={prioridade} compact />);
      const referencia = container.firstElementChild as HTMLElement;

      expect(pilula.className, `prévia em "${rotulo}"`).toBe(referencia.className);
      expect(pilula.title).toBe(`Prioridade: ${rotulo}`);
    }
  });
});

describe('Etapa 170 — segmento de prioridade: primary só na opção escolhida', () => {
  it('marca a escolhida com primary, deixa as demais neutras e com foco visível', () => {
    render(<PrioritySegment value="medium" onChange={() => {}} />);

    const grupo = screen.getByRole('radiogroup', { name: 'Prioridade' });
    expect(grupo).toBeInTheDocument();

    const opcoes = screen.getAllByRole('radio') as HTMLButtonElement[];
    expect(opcoes.map((o) => o.textContent)).toEqual(['Baixa', 'Média', 'Alta', 'Urgente']);

    for (const opcao of opcoes) {
      const escolhida = opcao.textContent === 'Média';
      expect(opcao.getAttribute('aria-checked')).toBe(String(escolhida));
      // Tabindex móvel: um só tab stop, como um radio group nativo.
      expect(opcao.tabIndex).toBe(escolhida ? 0 : -1);
      // Foco visível do sistema em todas as opções (navegação por setas).
      expect(opcao.className).toContain('focus-visible:ring-2');

      if (escolhida) {
        expect(opcao.className).toContain('bg-primary');
        expect(opcao.className).toContain('text-primary-foreground');
      } else {
        expect(opcao.className).not.toContain('bg-primary');
        expect(opcao.className).toContain('text-muted-foreground');
        // Sem cor por prioridade no controle (D12 fora desta PR).
        expect(opcao.className).not.toContain('--warning-text');
        expect(opcao.className).not.toContain('--destructive-text');
      }
    }
  });

  it('as setas andam entre as opções e trocam a escolha (com volta no fim)', () => {
    const escolhas: string[] = [];
    render(<PrioritySegment value="urgent" onChange={(p) => escolhas.push(p)} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Urgente' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Urgente' }), { key: 'ArrowLeft' });

    expect(escolhas).toEqual(['low', 'high']);
  });
});

describe('Etapa 170 — descarte do rascunho', () => {
  it('sem título, "Cancelar" fecha direto — não pede confirmação', async () => {
    montar();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
    expect(screen.queryByTestId('nt-descarte')).toBeNull();
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });

  it('com título digitado, pede confirmação e o título continua editável ao voltar atrás', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByTestId('nt-descarte')).toBeInTheDocument();
    expect(sonda()).toHaveTextContent('aberto');

    fireEvent.click(screen.getByTestId('nt-descarte-continuar'));

    await waitFor(() => expect(screen.queryByTestId('nt-descarte')).toBeNull());
    expect(sonda()).toHaveTextContent('aberto');
    expect(titulo().value).toBe('Ligar para Ana');

    // E o título continua aceitando edição depois de voltar atrás.
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana amanhã' } });
    expect(titulo().value).toBe('Ligar para Ana amanhã');
    expect(pilulaDaPrevia('Média')).toBeInTheDocument();
  });

  it('confirmar o descarte fecha o modal sem gravar nada', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(await screen.findByTestId('nt-descarte-confirmar'));

    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });
});
