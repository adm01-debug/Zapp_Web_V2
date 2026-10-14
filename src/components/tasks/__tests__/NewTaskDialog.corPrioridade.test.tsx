/**
 * Etapa 170 (plano, linhas 126 e 450; imagem 04, seção 3.4; decisão D12) — a cor
 * da prioridade na prévia do modal e o descarte do rascunho.
 *
 * O defeito: na imagem 04 a pílula "Média" da prévia é AZUL, enquanto Lista e
 * Quadro usam âmbar. D12 manda a pílula usar SEMPRE a cor da prioridade
 * (`PriorityPill`/`PriorityChip`) e reservar o `primary` ao segmento ESCOLHIDO do
 * controle. Este arquivo prova:
 *
 *  - a prévia do modal (item 1) mostra a pílula da prioridade na cor da
 *    prioridade — âmbar em Média — e acompanha a escolha do controle;
 *  - o segmento (item 2) pinta de `primary` só a opção escolhida; as demais ficam
 *    neutras, com o foco visível do sistema;
 *  - o descarte (item 3) pede confirmação com título digitado e fecha direto sem
 *    título — o título continua editável quando o usuário volta atrás.
 *
 * Nada aqui olha snapshot: a pílula é conferida pela CLASSE que o componente
 * escreve, e a classe só muda com a correção (o vermelho do defeito é o
 * `text-primary` de antes).
 */
import { resetSupabaseMock, setWriteResult, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { PrioritySegment } from '@/components/tasks/shared/new-task/PrioritySegment';

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

describe('Etapa 170 — cor da prioridade na prévia do modal (D12)', () => {
  it('a prévia mostra a pílula "Média" no ÂMBAR da prioridade, não no primary azul', () => {
    montar();

    const pilula = pilulaDaPrevia('Média');

    // O par de cor de prioridade é o mesmo em toda a casa (tokens de TEXTO, E.3).
    expect(pilula.className).toContain('text-[hsl(var(--warning-text))]');
    expect(pilula.className).toContain('bg-warning/15');
    expect(pilula.className).toContain('border-warning/40');
    // O defeito era exatamente este: a prévia herdava o `primary` do segmento.
    expect(pilula.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(pilula.className).not.toContain('bg-primary');
  });

  it('para as 4 prioridades, a pílula da prévia traz a classe da prioridade (nunca o primary)', () => {
    montar();

    for (const [rotulo, classe] of [
      ['Baixa', 'bg-muted/60'],
      ['Média', 'bg-warning/15'],
      ['Alta', 'bg-destructive/15'],
      ['Urgente', 'bg-destructive/20'],
    ] as const) {
      fireEvent.click(screen.getByRole('radio', { name: rotulo }));

      const pilula = pilulaDaPrevia(rotulo);
      expect(pilula.className, `prévia em "${rotulo}"`).toContain(classe);
      expect(pilula.title).toBe(`Prioridade: ${rotulo}`);
      // O azul do `primary` não aparece em pílula nenhuma (D12).
      expect(pilula.className).not.toContain('bg-primary');
      expect(pilula.className).not.toContain('text-primary');
    }
  });

  it('a prévia acompanha o controle: escolher "Alta" troca a pílula para o vermelho', () => {
    montar();

    // O padrão do formulário é Média — âmbar.
    expect(pilulaDaPrevia('Média').className).toContain('--warning-text');

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }));

    expect(pilulaDaPrevia('Alta').className).toContain('--destructive-text');
    expect(pilulaDaPrevia('Alta').className).toContain('border-destructive/40');

    fireEvent.click(screen.getByRole('radio', { name: 'Urgente' }));

    // Urgente é a ponta da escada: tinta mais cheia (/20) e borda sólida.
    const urgente = pilulaDaPrevia('Urgente');
    expect(urgente.className).toContain('--destructive-text');
    expect(urgente.className).toContain('bg-destructive/20');
    expect(urgente.className).toContain('border-destructive');
  });
});

describe('Etapa 170 — segmento de prioridade: primary só na opção escolhida', () => {
  /** O par de TEXTO de cada prioridade — o MESMO do PriorityPill/PriorityChip. */
  const COR_DA_PRIORIDADE: Record<string, string> = {
    Baixa: 'text-muted-foreground',
    'Média': 'text-[hsl(var(--warning-text))]',
    Alta: 'text-[hsl(var(--destructive-text))]',
    Urgente: 'text-[hsl(var(--destructive-text))]',
  };

  it('marca a escolhida com primary e escreve as demais na cor da própria prioridade, com foco visível', () => {
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
        // A escolhida é AZUL, não a cor da prioridade — "escolhido" e
        // "prioridade" não podem ser a mesma cor (D12, plano linha 450).
        expect(opcao.className).not.toContain('--warning-text');
      } else {
        // O azul do `primary` é SÓ da opção escolhida (D12) ...
        expect(opcao.className).not.toContain('bg-primary');
        expect(opcao.className).not.toContain('text-primary-foreground');
        // ... e as demais usam a COR DA PRÓPRIA PRIORIDADE: âmbar na Média,
        // vermelho na Alta/Urgente, cinza na Baixa.
        expect(opcao.className).toContain(COR_DA_PRIORIDADE[opcao.textContent ?? '']);
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
