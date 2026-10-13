/**
 * Etapas 050/051/053/054 — a Lista em TABELA.
 *
 * O que este arquivo pina (e que antes NÃO existia: a Lista eram cartões):
 *
 *  1. a `<table>` com as 6 colunas do contrato (049) na ordem, cabeçalho fixo;
 *  2. a linha de grupo com ícone circular, contador e o subtítulo de data do
 *     "Hoje" em pt-BR (051);
 *  3. os dois vazios e o carregamento continuam sendo do modo (via
 *     `TasksListMode`, que passa a renderizar a tabela);
 *  4. a célula Tarefa (053): checkbox que conclui sem abrir + motivo âmbar;
 *  5. a célula Contato (054): avatar + nome, "Sem contato" e o clique que abre
 *     a conversa sem abrir os detalhes;
 *  6. as 4 colunas que as etapas 056–060 vão preencher já existem como célula.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { TasksListTable } from '@/components/tasks/list/TasksListTable';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import { makeTaskRow } from '@/test/mocks/tarefas';

/** Item do domínio: reusa a fixture do banco (mesmo shape) sem duplicar dados. */
function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

const vazio: WorkItem[] = [];

function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  return {
    overdue: vazio,
    today: vazio,
    tomorrow: vazio,
    upcoming: vazio,
    noDue: vazio,
    done7d: vazio,
    doneOlder: vazio,
    ...over,
  };
}

/** A primeira renderização não anima a entrada (o ref é o mesmo do modo). */
const temMontado = { current: true };

/**
 * Medição dos dois pontos da recusa, sem string literal no lugar de conta:
 *
 *  - ALTURA DE ALVO: lida das classes REAIS que o elemento renderiza. No Tailwind
 *    `1` = 0,25rem = 4 px, então `h-10`/`min-h-10` valem 40 px (a regra de tela).
 *  - CONTRASTE: calculado a partir dos tokens REAIS de `src/styles/tokens.css`,
 *    nos dois temas, compondo a superfície translúcida do grupo (`bg-muted/30`
 *    sobre `bg-background`) como o navegador compõe — sRGB, alfa sobre o fundo.
 */
const REM_PX = 16;

function alturaDeclarada(el: Element): number {
  const px = (el.getAttribute('class') ?? '')
    .split(/\s+/)
    .map((c) => /^(?:min-)?h-(\d+(?:\.\d+)?)$/.exec(c))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]) * 0.25 * REM_PX);
  return Math.max(0, ...px);
}

/** Valores de `:root` (claro) e `.dark` lidos do próprio tokens.css — nada digitado à mão. */
function tokensDoTema(tema: 'claro' | 'escuro'): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const inicio = css.indexOf(tema === 'claro' ? ':root {' : '.dark {');
  if (inicio < 0) throw new Error(`bloco ${tema} não encontrado em tokens.css`);
  const bloco = css.slice(inicio, css.indexOf('\n}', inicio));
  const tokens: Record<string, string> = {};
  for (const m of bloco.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)) {
    tokens[`--${m[1]}`] = `${m[2]} ${m[3]}% ${m[4]}%`;
  }
  return tokens;
}

type RGB = [number, number, number];

function hslParaRgb(valor: string): RGB {
  const [h, s, l] = valor.split(' ').map((p) => parseFloat(p));
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * (s / 100);
  const hLinha = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hLinha % 2) - 1));
  const m = lum - c / 2;
  const base: RGB =
    hLinha < 1 ? [c, x, 0] :
    hLinha < 2 ? [x, c, 0] :
    hLinha < 3 ? [0, c, x] :
    hLinha < 4 ? [0, x, c] :
    hLinha < 5 ? [x, 0, c] : [c, 0, x];
  return [base[0] + m, base[1] + m, base[2] + m];
}

/** `cor` com alfa sobre `fundo` (a composição que o navegador faz, em sRGB). */
function sobrepor(cor: RGB, fundo: RGB, alfa: number): RGB {
  return [0, 1, 2].map((i) => cor[i] * alfa + fundo[i] * (1 - alfa)) as RGB;
}

function luminancia([r, g, b]: RGB): number {
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: RGB, b: RGB): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

const ESCALA_DE_TEXTO = new Set([
  'text-3xs', 'text-2xs', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl',
  'text-left', 'text-center', 'text-right', 'text-justify',
]);

/** O par de cor de texto que o elemento REALMENTE aplica, como nome de token. */
function tokenDeTexto(el: Element): string {
  for (const classe of (el.getAttribute('class') ?? '').split(/\s+/)) {
    const arbitrario = /^text-\[hsl\(var\((--[a-z-]+)\)\)\]$/.exec(classe);
    if (arbitrario) return arbitrario[1];
    if (ESCALA_DE_TEXTO.has(classe)) continue;
    const simples = /^text-([a-z][a-z-]*)$/.exec(classe);
    if (simples) return `--${simples[1]}`;
  }
  throw new Error(`sem classe de cor de texto em "${el.getAttribute('class')}"`);
}

interface Acoes {
  onOpen: ReturnType<typeof vi.fn>;
  onToggleDone: ReturnType<typeof vi.fn>;
  onOpenContact: ReturnType<typeof vi.fn>;
}

function renderTabela(byDue: BucketsByDue, now?: Date): Acoes {
  // A implementação tipada faz o `vi.fn` devolver a assinatura do callback (sem cast).
  const acoes = {
    onOpen: vi.fn((_item: WorkItem) => {}),
    onToggleDone: vi.fn((_item: WorkItem) => {}),
    onOpenContact: vi.fn((_item: WorkItem) => {}),
  };
  render(
    <TooltipProvider>
      <TasksListTable byDue={byDue} now={now} hasMounted={temMontado} {...acoes} />
    </TooltipProvider>
  );
  return acoes;
}

describe('TasksListTable — etapas 050/051/053/054 (estrutura, grupos e as duas células)', () => {
  beforeEach(() => cleanup());

  it('1) desenha as 6 colunas do contrato na ordem, num cabeçalho fixo', () => {
    const { container } = render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({ noDue: [item({ id: 'n1' })] })}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(container.querySelector('table')).toBeTruthy();
    const thead = container.querySelector('thead');
    expect(thead).toBeTruthy();
    const colunas = within(thead as HTMLElement).getAllByRole('columnheader');
    expect(colunas.map((c) => c.textContent)).toEqual([
      'Tarefa', 'Contato', 'Prioridade', 'Prazo', 'Lembrete', 'Estado',
    ]);
    // "cabeçalho fixo" (etapa 050): a célula de cabeçalho é `sticky`.
    colunas.forEach((c) => expect(c.className).toContain('sticky'));
  });

  it('2) a linha de grupo traz ícone circular, contador e o subtítulo de data no "Hoje"', () => {
    const { container } = render(
      <TooltipProvider>
        <TasksListTable
          byDue={buckets({
            overdue: [item({ id: 'o1' }), item({ id: 'o2' })],
            today: [item({ id: 'h1' })],
          })}
          now={new Date(2026, 9, 11, 10, 0)}
          hasMounted={temMontado}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </TooltipProvider>
    );

    const atrasadas = container.querySelector('[data-group="atrasadas"]') as HTMLElement;
    expect(atrasadas.textContent).toContain('Atrasadas');
    expect(atrasadas.textContent).toContain('2');                    // o contador
    expect(atrasadas.querySelector('span.rounded-full svg')).toBeTruthy();  // o ícone circular

    const hoje = container.querySelector('[data-group="hoje"]') as HTMLElement;
    expect(hoje.querySelector('span.rounded-full svg')).toBeTruthy();
    // 11/10/2026 é domingo: o subtítulo é a regra única (`daySubtitle`).
    expect(hoje.textContent).toContain('Domingo, 11 de outubro');
  });

  it('2b) "Próximas" sai separada por dia, com o subcabeçalho de cada dia', () => {
    const dia = (d: number) => new Date(2026, 9, d, 12, 0).toISOString();
    renderTabela(
      buckets({
        upcoming: [
          item({ id: 'u1', due_date: dia(14) }),
          item({ id: 'u2', due_date: dia(16) }),
        ],
      }),
      new Date(2026, 9, 11, 10, 0)
    );

    const dias = screen.getAllByTestId('list-day-row');
    expect(dias).toHaveLength(2);
    expect(dias[0].textContent?.length).toBeGreaterThan(0);
    expect(dias[1].textContent?.length).toBeGreaterThan(0);
    expect(dias[0].textContent).not.toBe(dias[1].textContent);
    expect(screen.getAllByTestId('task-row')).toHaveLength(2);
  });

  it('4) a célula Tarefa conclui pelo checkbox sem abrir a linha e mostra o motivo âmbar', () => {
    const alvo = item({
      id: 'k1',
      title: 'Ligar para o cliente',
      status: 'waiting',
      waiting_reason: 'Aguardando aprovação do cliente',
    });
    const acoes = renderTabela(buckets({ noDue: [alvo] }));

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getByText('Ligar para o cliente')).toBeTruthy();
    expect(within(linha).getByText('Aguardando aprovação do cliente')).toBeTruthy();

    fireEvent.click(within(linha).getByRole('checkbox', { name: 'Concluir tarefa' }));

    expect(acoes.onToggleDone).toHaveBeenCalledWith(alvo);
    expect(acoes.onOpen).not.toHaveBeenCalled();
  });

  it('4b) a linha CONCLUÍDA (7 dias) usa o checkbox de reabrir', () => {
    const feita = item({ id: 'c1', title: 'Já foi', status: 'done', completed_at: new Date().toISOString() });
    const acoes = renderTabela(buckets({ done7d: [feita] }));

    // A seção "Concluídas" nasce recolhida: o item só existe depois de abrir.
    expect(screen.queryByTestId('task-row')).toBeNull();
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    fireEvent.click(within(screen.getByTestId('task-row')).getByRole('checkbox', { name: 'Reabrir tarefa' }));

    expect(acoes.onToggleDone).toHaveBeenCalledWith(feita);
  });

  it('5) a célula Contato mostra avatar e nome e abre a conversa sem abrir os detalhes', () => {
    const comContato = item({
      id: 'c1',
      title: 'Retornar orçamento',
      contact: { id: 'ct1', name: 'Maria Souza', phone: null, avatar_url: null },
    });
    const acoes = renderTabela(buckets({ noDue: [comContato] }));

    const linha = screen.getByTestId('task-row');
    const botao = within(linha).getByRole('button', { name: /Maria Souza/ });
    expect(within(botao).getByText('MS')).toBeTruthy();   // iniciais do avatar

    fireEvent.click(botao);
    expect(acoes.onOpenContact).toHaveBeenCalledWith(comContato);
    expect(acoes.onOpen).not.toHaveBeenCalled();           // o clique do contato não abre a linha
  });

  it('5b) sem contato a célula diz "Sem contato" e não é acionável', () => {
    renderTabela(buckets({ noDue: [item({ id: 's1', title: 'Sem vínculo', contact: null })] }));

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getByText('Sem contato')).toBeTruthy();
    expect(within(linha).queryByRole('button', { name: /Sem contato/ })).toBeNull();
  });

  it('6) as colunas 056–060 já existem como célula (a preencher em cartão próprio)', () => {
    renderTabela(buckets({ noDue: [item({ id: 'n1' })] }));

    const linha = screen.getByTestId('task-row');
    expect(within(linha).getAllByRole('cell')).toHaveLength(6);
    expect(within(linha).getAllByTestId('list-cell-pendente')).toHaveLength(4);
  });

  it('3) o modo Lista passa a renderizar a tabela, com a linha do item dentro dela', () => {
    render(
      <TooltipProvider>
        <TasksListMode
          byDue={buckets({ noDue: [item({ id: 'n1', title: 'Na tabela' })] })}
          isLoading={false}
          searchQuery=""
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
          onMoveTo={vi.fn()}
          onDelete={vi.fn()}
          onClearFilter={vi.fn()}
          hasMounted={temMontado}
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('tasks-list-table')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByTestId('task-row').getAttribute('data-item-id')).toBe('n1');
    expect(screen.getByText('Na tabela')).toBeTruthy();
  });

  it('7) o título é um <button> nativo: foco pelo teclado e um clique só abrem os detalhes', () => {
    const alvo = item({ id: 'kb1', title: 'Abrir pelo teclado' });
    const acoes = renderTabela(buckets({ noDue: [alvo] }));

    const titulo = within(screen.getByTestId('task-row')).getByRole('button', { name: 'Abrir pelo teclado' });

    // Botão NATIVO (não um <span>, não tabIndex/onKeyDown à mão): Enter/Espaço, foco e o
    // anel de foco vêm do navegador. Era o que faltava para o teclado alcançar o Sheet na
    // Lista — o modo padrão — depois da troca para tabela.
    expect(titulo.tagName).toBe('BUTTON');
    expect(titulo.getAttribute('type')).toBe('button');
    expect(titulo.className).toContain('focus-visible:ring-2');

    titulo.focus();
    expect(document.activeElement).toBe(titulo);

    // O título abre UMA vez: o `stopPropagation` impede o clique da linha de somar.
    fireEvent.click(titulo);
    expect(acoes.onOpen).toHaveBeenCalledTimes(1);
    expect(acoes.onOpen).toHaveBeenCalledWith(alvo);
  });

  it('8) todo alvo (grupo, dica, título, contato e "ver mais") declara 40 px ou mais', () => {
    renderTabela(
      buckets({
        overdue: [item({ id: 'o1' })],
        upcoming: [item({ id: 'u1', due_date: new Date(2026, 9, 20, 12, 0).toISOString() })],
        today: [item({
          id: 'a1',
          title: 'Alvo medido',
          contact: { id: 'ct1', name: 'Maria Souza', phone: null, avatar_url: null },
        })],
        doneOlder: [item({ id: 'c9', status: 'done' })],
      }),
      new Date(2026, 9, 11, 10, 0)
    );

    // O rodapé "ver mais (30 dias)" só existe com concluídas de 8 a 30 dias e o grupo aberto.
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));

    const alvos: Array<[string, HTMLElement]> = [
      ['recolher do grupo', screen.getByRole('button', { name: /Atrasadas/ })],
      ['dica Info do grupo', screen.getByRole('button', { name: /Ordenado por prazo/ })],
      ['título da linha', screen.getByRole('button', { name: 'Alvo medido' })],
      ['contato da linha', screen.getByRole('button', { name: /Maria Souza/ })],
      ['"ver mais (30 dias)"', screen.getByRole('button', { name: /ver mais \(30 dias\)/ })],
    ];

    for (const [nome, el] of alvos) {
      expect(alturaDeclarada(el), `${nome}: ${alturaDeclarada(el)}px`).toBeGreaterThanOrEqual(40);
    }

    // A dica `Info` também ganha foco visível (antes não tinha nenhum).
    expect(alvos[1][1].className).toContain('focus-visible:ring-2');
  });

  it('9) o título "Hoje" aplica o par de TEXTO do aviso e passa AA contra o fundo do grupo', () => {
    renderTabela(buckets({ today: [item({ id: 'h1' })] }), new Date(2026, 9, 11, 10, 0));

    const botao = screen.getByRole('button', { name: /^Hoje/ });
    // A superfície real por baixo do título é a linha do grupo: `bg-muted/30` sobre `bg-background`.
    expect((botao.closest('tr') as HTMLElement).className).toContain('bg-muted/30');
    // O ícone do grupo já usava o par de TEXTO (`--warning-text`); o título tem de usar o mesmo.
    expect(tokenDeTexto(botao)).toBe('--warning-text');

    for (const tema of ['claro', 'escuro'] as const) {
      const t = tokensDoTema(tema);
      const superficie = sobrepor(hslParaRgb(t['--muted']), hslParaRgb(t['--background']), 0.3);
      const razao = contraste(hslParaRgb(t[tokenDeTexto(botao)]), superficie);
      expect(razao, `${tema}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
