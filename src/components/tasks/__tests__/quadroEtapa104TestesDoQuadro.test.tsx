/**
 * Etapa 104 do plano de design — **Testes do Quadro**
 * (`docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, linha 363):
 * "Subtítulos, 3/3 e rodapé, tag Atrasada, chip de espera, capturar, menu da
 * coluna e recolher."
 *
 * Conferência contra o código ATUAL (16/10/2026): o que já estava coberto NÃO
 * foi reescrito — o relato da entrega cita o arquivo de cada um. Aqui ficam os
 * elementos que só existiam sem prova (ou com prova de outra camada):
 *
 *  080/081 subtítulos ......... o Unitário (BoardColumn) já cobre; aqui o caso é
 *                              de INTEGRAÇÃO: o trilho inteiro do Quadro.
 *  082     3/3 e rodapé ....... idem (contador, barra segmentada e rodapé vêm do
 *                              trilho, não de uma coluna montada à mão).
 *  086     tag "Atrasada" ..... **LACUNA**: nenhum teste do repositório lia o
 *                              cartão com prazo vencido.
 *  089     chip de espera ..... **LACUNA na tela**: só havia "o motivo aparece"
 *                              (WorkItemCard.test.tsx, modo lista). Faltava o chip
 *                              do Quadro (âmbar, truncado) e o prazo vermelho junto.
 *  092     menu da coluna ..... o ⓘ da POLÍTICA só tinha teste de área de toque
 *                              (BoardColumn.politica-coluna); aqui a política é
 *                              lida no tooltip, o que o leitor de tela alcança.
 *
 * Tudo passa pelo componente REAL (`TasksBoardMode` → `BoardColumn` →
 * `WorkItemCard`): nenhuma asserção lê constante do código — os textos são
 * literais da spec (imagem 05 e seção 3.5 do plano).
 *
 * Citação da tabela da seção 3.5 (imagem 05) em
 * `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`:
 *   080–081 subtítulos ........... linha 138 ("...Fazendo 3/3 (Conclua uma para iniciar outra)...")
 *   082 3/3, barra e rodapé ...... linha 139
 *   086 tag "Atrasada" .......... linha 142
 *   089 chip de espera .......... linha 145 ("Aguardando: ponto âmbar + motivo")
 *   091 capturar ................ linha 146
 *   092–093 menu da coluna e recolher ... linhas 147 e 149
 *   A própria etapa 104 está na tabela do Bloco E, linha 363.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Importa o harness ANTES dos módulos sob teste (ele registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

const item = (over: Record<string, unknown> = {}): WorkItem =>
  makeTaskRow(over) as unknown as WorkItem;

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

/** Data absoluta a N dias atrás — o rótulo de atraso não depende da hora do dia. */
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function renderQuadro(over: Partial<Parameters<typeof TasksBoardMode>[0]> = {}) {
  return render(
    <TooltipProvider>
      <TasksBoardMode
        byStatus={VAZIO}
        isLoading={false}
        onMove={vi.fn()}
        onReorder={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onCreate={vi.fn()}
        {...over}
      />
    </TooltipProvider>,
  );
}

const coluna = (status: WorkItemStatus) =>
  document.querySelector<HTMLElement>(`[data-board-column="${status}"]`);

/** O cartão (article) que contém um texto — é nele que as peças têm de conviver. */
const cartaoDe = (texto: string) => screen.getByText(texto).closest('article');

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

// ---------------------------------------------------------------------------
// 080/081 + 082 — a coluna vista pelo TRILHO (integração, não unidade)
// ---------------------------------------------------------------------------

const SUBTITULOS = ['A organizar', 'Próximas ações', 'Conclua uma para iniciar outra', 'Dependências externas', 'Últimos 7 dias'];
const POLITICAS = [
  'Tudo que você capturou e ainda não decidiu.',
  'Decidido: vai ser feito.',
  'O que está nas suas mãos agora. Três é o limite.',
  'Parou por causa de alguém ou algo. Escreva o motivo.',
  'Feito. Fica 7 dias à vista.',
];

/** Uma tarefa em cada coluna: o Quadro completo, sem coluna vazia (etapa 103). */
const COLUNAS_COM_CARTAO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [item({ id: 'b1', status: 'backlog' })],
  todo: [item({ id: 't1', status: 'todo' })],
  doing: [item({ id: 'f1', status: 'doing' })],
  waiting: [item({ id: 'w1', status: 'waiting' })],
  done: [item({ id: 'c1', status: 'done', completed_at: diasAtras(0) })],
  cancelled: [item({ id: 'x1', status: 'cancelled' })],
};

describe('etapa 104 — subtítulos, contador 3/3 e rodapé pelo trilho do Quadro', () => {
  it('as cinco colunas mostram o subtítulo curto e a política longa NÃO ocupa o cabeçalho', () => {
    renderQuadro({ byStatus: COLUNAS_COM_CARTAO });

    for (const texto of SUBTITULOS) {
      expect(screen.getByText(texto), `subtítulo "${texto}"`).toBeTruthy();
    }
    // Com cartão em toda coluna não sobra microcopy de vazio: a política longa
    // não pode aparecer como texto em lugar nenhum (ela mora no tooltip do ⓘ).
    for (const politica of POLITICAS) {
      expect(screen.queryByText(politica), `política "${politica}" vazou no cabeçalho`).toBeNull();
    }
  });

  it('a coluna Fazendo cheia traz o 3/3, a barra segmentada e o rodapé do limite', () => {
    renderQuadro({
      byStatus: { ...VAZIO, doing: [
        item({ id: 'f1', status: 'doing' }), item({ id: 'f2', status: 'doing' }), item({ id: 'f3', status: 'doing' }),
      ] },
      doingCount: 3,
    });

    expect(screen.getByText('3/3')).toBeTruthy();
    const barra = screen.getByRole('progressbar', { name: 'Limite de Fazendo' });
    expect(barra.getAttribute('aria-valuenow')).toBe('3');
    expect(screen.getByText('Seu limite é de 3 tarefas em execução.')).toBeTruthy();
    expect(screen.getByTestId('col-limit-footer-doing')).toBeTruthy();
    // Só Fazendo tem limite duro: as outras colunas não herdam barra nem rodapé.
    for (const status of ['backlog', 'todo', 'waiting', 'done'] as WorkItemStatus[]) {
      expect(screen.queryByTestId(`col-limit-bar-${status}`), `barra em ${status}`).toBeNull();
      expect(screen.queryByTestId(`col-limit-footer-${status}`), `rodapé em ${status}`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 086 — tag "Atrasada" (ícone de alerta + texto, ao lado do prazo em vermelho)
// ---------------------------------------------------------------------------

describe('etapa 104 — tag "Atrasada" no cartão do Quadro (etapa 086)', () => {
  it('prazo vencido rende a tag em tinta destrutiva com ícone de alerta e o prazo no title', () => {
    renderQuadro({
      byStatus: { ...VAZIO, todo: [item({ id: 't1', status: 'todo', due_date: diasAtras(3) })] },
    });

    const chip = screen.getByText(/^Atrasada /);

    expect(chip.className, 'a tag é TEXTO destrutivo (não o preenchimento)').toContain('text-[hsl(var(--destructive-text))]');
    expect(chip.querySelector('svg'), 'ícone de alerta da tag').toBeTruthy();
    expect(chip.getAttribute('title')).toBe(`Prazo: ${chip.textContent}`);
    expect(chip.closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('todo');
  });

  it('prazo que ainda não venceu NÃO ganha a tag (o alerta é só do vencido)', () => {
    renderQuadro({
      byStatus: { ...VAZIO, todo: [item({ id: 't1', status: 'todo', due_date: diasAtras(-5) })] },
    });

    expect(screen.queryByText(/^Atrasada /), 'prazo futuro não é atraso').toBeNull();
    // O prazo continua no cartão — o que muda é o rótulo.
    expect(screen.getByTitle(/^Prazo: /)).toBeTruthy();
  });

  it('cartão concluído com prazo vencido não mostra a tag (ela é do que ainda pesa)', () => {
    renderQuadro({
      byStatus: { ...VAZIO, done: [item({ id: 'c1', status: 'done', completed_at: diasAtras(0), due_date: diasAtras(3) })] },
    });

    expect(screen.getByText('Ligar para o cliente')).toBeTruthy();
    expect(screen.queryByText(/^Atrasada /)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 089 — chip de espera (âmbar, motivo truncado) + prazo vermelho no mesmo cartão
// ---------------------------------------------------------------------------

describe('etapa 104 — chip de espera no cartão do Quadro (etapa 089)', () => {
  const MOTIVO = 'Retorno da transportadora';

  it('em Aguardando o chip mostra o motivo em âmbar, truncado, junto do prazo vermelho', () => {
    renderQuadro({
      byStatus: { ...VAZIO, waiting: [item({ id: 'w1', status: 'waiting', waiting_reason: MOTIVO, due_date: diasAtras(2) })] },
    });

    const motivo = screen.getByText(MOTIVO);
    const chip = motivo.closest('p')!;

    expect(chip.className, 'chip âmbar (tinta de aviso, não preenchimento)').toContain('text-[hsl(var(--warning-text))]');
    expect(motivo.className, 'o motivo trunca em vez de esticar o cartão').toContain('truncate');
    expect(chip.closest('[data-board-column]')?.getAttribute('data-board-column')).toBe('waiting');

    // O prazo vencido convive com o chip no MESMO cartão, em vermelho.
    const prazo = screen.getByText(/^Atrasada /);
    expect(prazo.className).toContain('text-[hsl(var(--destructive-text))]');
    expect(cartaoDe(MOTIVO)).toBe(cartaoDe(prazo.textContent!));
  });

  it('Aguardando sem motivo não tem chip (nada a truncar)', () => {
    renderQuadro({
      byStatus: { ...VAZIO, waiting: [item({ id: 'w1', status: 'waiting' })] },
    });

    expect(screen.queryByText(MOTIVO)).toBeNull();
    // O cartão está lá — é o chip que não existe.
    expect(coluna('waiting')!.querySelectorAll('[data-testid="work-item-card"]')).toHaveLength(1);
  });

  // 089 pede "truncado com tooltip": hoje o motivo trunca e o texto completo NÃO
  // fica alcançável (nem `title`, nem tooltip). Mudar a produção é da etapa 089
  // (dona: telas), então a lacuna fica registrada aqui, sem teste que finge.
  it.todo('089 — o motivo truncado do chip de espera ganha tooltip com o texto completo');
});

// ---------------------------------------------------------------------------
// 092 — menu da coluna: o ⓘ leva a política longa (o cabeçalho mostra o subtítulo)
// ---------------------------------------------------------------------------

describe('etapa 104 — menu da coluna (ⓘ da política)', () => {
  it('cada coluna tem o botão de política e o toque/hover revela a política longa', async () => {
    renderQuadro({ byStatus: COLUNAS_COM_CARTAO });

    const botoes = screen.getAllByRole('button', { name: 'Política da coluna' });
    expect(botoes).toHaveLength(5);

    // jsdom não move ponteiro nem implementa a Pointer Events API (Radix usa).
    const proto = Element.prototype as unknown as Record<string, () => unknown>;
    proto.hasPointerCapture ??= () => false;
    proto.setPointerCapture ??= () => undefined;
    proto.releasePointerCapture ??= () => undefined;

    const politicaDeFazendo = POLITICAS[2];
    expect(screen.queryByText(politicaDeFazendo), 'a política não nasce aberta').toBeNull();

    fireEvent.pointerEnter(botoes[2]);
    fireEvent.pointerMove(botoes[2]);
    fireEvent.focus(botoes[2]);

    await waitFor(() => {
      expect(screen.getByText(politicaDeFazendo), 'política longa no tooltip do ⓘ').toBeTruthy();
    });
  });
});