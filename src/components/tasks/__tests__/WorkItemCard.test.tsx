/**
 * Etapa 85 — dentes do `WorkItemCard` que faltavam nos testes por TELA.
 *
 * Os arquivos irmãos já trancam: o Backspace não apaga e o Delete apaga
 * (`taskComponents`), os 5 grupos do kebab, o "Fazendo cheio" e as ações
 * Concluir/Cancelar/Lembrar-me (`cardAcoes`), e o contraste/altura por classe
 * (`movimentoEContraste`). Aqui ficam os buracos: os ESTADOS (concluído, em
 * espera e Agenda), as TECLAS do próprio card, as AÇÕES que param no card
 * (checkbox, contato), o caminho LIBERADO do kebab (Abrir, mover com vaga,
 * remover alarme) e o cartão do Quadro (N-180: sem botão-dentro-de-botão e
 * toque de 44 px no "Abrir conversa").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { HTMLAttributes } from 'react';

// Importa o harness ANTES do módulo sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

/** Item do domínio a partir da fixture do banco (mesmo shape), sem duplicar dados. */
const item = (over: Partial<WorkItem> = {}): WorkItem =>
  makeTaskRow(over as Record<string, unknown>) as unknown as WorkItem;

const card  = () => screen.getByTestId('work-item-card');
const kebab = () => screen.getByRole('button', { name: 'Mais opções' });

/** Abre um menu Radix só pelo teclado (jsdom não tem a Pointer Events API). */
const abrir = (el: HTMLElement) => {
  fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' });
  return screen.findByRole('menu');
};

/** Abre o submenu do item indicado (ex.: "Mover para", "Lembrar-me"). */
const abrirSubmenu = (nome: RegExp | string) => {
  const alvo = screen.getByRole('menuitem', { name: nome });
  alvo.focus();
  fireEvent.keyDown(alvo, { key: 'ArrowRight', code: 'ArrowRight' });
};

beforeEach(() => {
  // Radix chama a Pointer Events API, que o jsdom não implementa.
  const proto = Element.prototype as unknown as Record<string, () => unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => cleanup());

describe('WorkItemCard — estados, ações, teclado e kebab', () => {
  it('item concluído risca o título e o checkbox vira "Reabrir tarefa"', () => {
    const onToggleDone = vi.fn();
    const { rerender } = render(
      <WorkItemCard item={item({ status: 'todo' })} mode="list" onToggleDone={onToggleDone} />
    );
    expect(screen.getByRole('checkbox', { name: 'Concluir tarefa' })).toBeTruthy();

    rerender(<WorkItemCard item={item({ status: 'done' })} mode="list" onToggleDone={onToggleDone} />);

    const reabrir = screen.getByRole('checkbox', { name: 'Reabrir tarefa' });
    expect(screen.getByText('Ligar para o cliente').className).toContain('line-through');
    fireEvent.click(reabrir);
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });

  it('item em espera mostra o motivo; sem motivo (ou na Agenda) não mostra', () => {
    const agora = new Date().toISOString();
    const { rerender } = render(
      <WorkItemCard
        item={item({ status: 'waiting', waiting_reason: 'aguardando o cliente', status_changed_at: agora })}
        mode="list"
      />
    );
    expect(screen.getByText('aguardando o cliente')).toBeTruthy();

    // Sem motivo não há o que mostrar.
    rerender(<WorkItemCard item={item({ status: 'waiting', status_changed_at: agora })} mode="list" />);
    expect(screen.queryByText('aguardando o cliente')).toBeNull();

    // A Agenda (etapa 56) é linha única e não reserva espaço para o motivo.
    rerender(
      <WorkItemCard
        item={item({ status: 'waiting', waiting_reason: 'aguardando o cliente', status_changed_at: agora })}
        mode="agenda"
      />
    );
    expect(screen.queryByText('aguardando o cliente')).toBeNull();
  });

  it('na Agenda o card vira linha única (h-11) e o kebab fica sempre visível', () => {
    const agora = new Date().toISOString();
    const { rerender } = render(<WorkItemCard item={item({ status_changed_at: agora })} mode="agenda" />);
    expect(card().getAttribute('data-mode')).toBe('agenda');
    expect(card().className).toContain('h-11');
    // Na Agenda o kebab não depende do hover (no desktop ele nasce com opacity-0).
    expect(kebab().className).not.toContain('opacity-0');

    rerender(<WorkItemCard item={item({ status_changed_at: agora })} mode="list" />);
    expect(card().getAttribute('data-mode')).toBe('list');
    expect(card().className).not.toContain('h-11');
    expect(kebab().className).toContain('opacity-0');
  });

  it('Enter no card abre a tarefa', () => {
    const onOpen = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onOpen={onOpen} />);

    fireEvent.keyDown(card(), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('as teclas x e X alternam a conclusão', () => {
    const onToggleDone = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onToggleDone={onToggleDone} />);

    fireEvent.keyDown(card(), { key: 'x' });
    fireEvent.keyDown(card(), { key: 'X' });
    expect(onToggleDone).toHaveBeenCalledTimes(2);
  });

  it('tecla disparada por um filho (checkbox) não abre nem conclui o card', () => {
    const onOpen = vi.fn();
    const onToggleDone = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onOpen={onOpen} onToggleDone={onToggleDone} />);

    // A tecla borbulha do checkbox até o article; a guarda de alvo impede que o card
    // trate o Enter/`x` do filho como atalho do PRÓPRIO card.
    const checkbox = screen.getByRole('checkbox', { name: 'Concluir tarefa' });
    fireEvent.keyDown(checkbox, { key: 'Enter' });
    fireEvent.keyDown(checkbox, { key: 'x' });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleDone).not.toHaveBeenCalled();
  });

  it('o checkbox conclui sem abrir o card; clicar no corpo abre', () => {
    const onOpen = vi.fn();
    const onToggleDone = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onOpen={onOpen} onToggleDone={onToggleDone} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Concluir tarefa' }));
    expect(onToggleDone).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ligar para o cliente'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('o chip do contato vem do item e o clique abre a conversa sem abrir o card', () => {
    const onOpen = vi.fn();
    const onOpenContact = vi.fn();
    render(
      <WorkItemCard
        item={item({ contact: { id: 'c1', name: 'Ana Souza', phone: null, avatar_url: null } })}
        mode="list"
        onOpen={onOpen}
        onOpenContact={onOpenContact}
      />
    );

    const chip = screen.getByTestId('contact-chip');
    expect(chip).toHaveTextContent('Ana Souza');
    fireEvent.click(chip);
    expect(onOpenContact).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('o kebab "Abrir" abre a tarefa', async () => {
    const onOpen = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onOpen={onOpen} />);

    await abrir(kebab());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('"Mover para": a coluna atual fica desabilitada e "Fazendo" com vaga chama onMoveTo', async () => {
    const onMoveTo = vi.fn();
    render(<WorkItemCard item={item({ status: 'todo' })} mode="list" doingCount={2} onMoveTo={onMoveTo} />);

    await abrir(kebab());
    abrirSubmenu(/Mover para/);

    // "A fazer" é a coluna atual: não faz sentido mover para onde já está.
    const atual = await screen.findByRole('menuitem', { name: 'A fazer' });
    expect(atual.getAttribute('aria-disabled')).toBe('true');

    // 2/3 deixa "Fazendo" liberado — a trava só entra com a coluna cheia.
    const fazendo = screen.getByRole('menuitem', { name: 'Fazendo' });
    expect(fazendo.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(fazendo);
    expect(onMoveTo).toHaveBeenCalledWith('doing');
  });

  it('"Lembrar-me" só oferece "Remover alarme" quando há alarme', async () => {
    const onClearReminder = vi.fn();
    const { unmount } = render(
      <WorkItemCard item={item({ remind_at: '2026-10-01T09:00:00.000Z' })} mode="list" onClearReminder={onClearReminder} />
    );
    await abrir(kebab());
    abrirSubmenu(/Lembrar-me/);
    const remover = await screen.findByRole('menuitem', { name: 'Remover alarme' });
    fireEvent.click(remover);
    expect(onClearReminder).toHaveBeenCalledTimes(1);
    unmount();

    // Sem alarme a opção não existe.
    render(<WorkItemCard item={item()} mode="list" onClearReminder={vi.fn()} />);
    await abrir(kebab());
    abrirSubmenu(/Lembrar-me/);
    await screen.findByRole('menuitem', { name: '15 min' });
    expect(screen.queryByRole('menuitem', { name: 'Remover alarme' })).toBeNull();
  });

  /**
   * N-180: no Quadro o spread do `dragHandleProps` da lib de DnD traz
   * `role="button"`. Antes da correção ele vinha DEPOIS do `role="article"` e
   * sobrepunha o role, então o card inteiro (que já tem checkbox, kebab e
   * "Abrir conversa" dentro) virava um botão com botões dentro: o leitor de
   * tela anunciava um widget e o axe acusava nested-interactive e
   * aria-allowed-role (role="button" não é permitido no elemento <article>).
   * Com o spread ANTES do role, o card continua article e a alça segue focável.
   */
  it('o elemento com dragHandleProps preserva o role article (sem botão-dentro-de-botão)', async () => {
    const { container } = render(
      <WorkItemCard
        item={item({ contact: { id: 'c1', name: 'Ana Souza', phone: null, avatar_url: null } })}
        mode="board"
        onOpenContact={vi.fn()}
        dragHandleProps={
          {
            role: 'button',
            tabIndex: 0,
            'aria-describedby': 'dnd-desc',
            'data-rbd-drag-handle-draggable-id': 't1',
          } as unknown as HTMLAttributes<HTMLElement>
        }
      />
    );

    // A alça de arrasto NÃO é um widget com controles dentro: o role do card
    // continua article (a lib não o converte em "button") e o foco se mantém.
    const alca = card();
    expect(alca.getAttribute('role')).toBe('article');
    expect(alca.getAttribute('role')).not.toBe('button');
    expect(alca.getAttribute('tabindex')).toBe('0');

    const resultado = await axe(container, {
      runOnly: { type: 'rule', values: ['nested-interactive', 'aria-allowed-role'] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });

  it('"Abrir conversa" tem área de toque de 44 px no Quadro (WCAG 2.5.5)', () => {
    render(
      <WorkItemCard
        item={item({ contact: { id: 'c1', name: 'Ana Souza', phone: null, avatar_url: null } })}
        mode="board"
        onOpenContact={vi.fn()}
      />
    );

    const btn = screen.getByRole('button', { name: 'Abrir conversa' }) as HTMLElement;
    const classes = btn.className.split(/\s+/);
    // Antes da correção o botão era h-6 w-6 (24 px).
    expect(classes).toContain('min-h-[44px]');
    expect(classes).toContain('min-w-[44px]');

    // N-180.6: sem ponteiro com hover (celular/tablet) `group-hover` nunca
    // dispara, então `opacity-0` + `pointer-events-none` deixavam o botão
    // escondido e morto ao toque. As classes da variante [@media(hover:none)]
    // são o único caminho que o torna alcançável ali: elas precisam estar
    // presentes E o CSS do Tailwind precisa emiti-las depois das utilities
    // base (mesma especificidade, a última vence) — medido com
    // `npx tailwindcss` e conferido no relato.
    expect(classes).toContain('pointer-events-none');
    expect(classes).toContain('opacity-0');
    expect(classes).toContain('[@media(hover:none)]:pointer-events-auto');
    expect(classes).toContain('[@media(hover:none)]:opacity-100');
  });
});

/**
 * Etapas 084–090 (plano 200): o card redesenhado. Cada teste mede UMA etapa pelo
 * DOM real do componente — o checkbox circular (D16), o "Urgente" junto ao
 * título (085), a tag "Atrasada" (086), os rótulos Prazo/Lembrete e a descrição
 * curta no card em Fazendo/selecionado (087/088), o chip de espera (089) e o
 * estado selecionado (090). Os primitivos são do cartão T11 e a data vem do
 * `workItemFormat.ts` (T04) — nada de reimplementar aqui.
 */
describe('etapas 084–090 — card redesenhado', () => {
  it('084 — checkbox CIRCULAR nas três superfícies e título em até 2 linhas', () => {
    (['list', 'board', 'agenda'] as const).forEach((mode) => {
      const { unmount } = render(<WorkItemCard item={item()} mode={mode} onToggleDone={vi.fn()} />);

      const check = screen.getByRole('checkbox', { name: 'Concluir tarefa' });
      expect(check.getAttribute('data-testid')).toBe('task-checkbox');
      expect(check.className).toContain('rounded-full');
      // o quadrado antigo do card não pode voltar
      expect(check.className).not.toContain('rounded-[4px]');

      const titulo = screen.getByText('Ligar para o cliente');
      expect(titulo.className).toContain(mode === 'agenda' ? 'truncate' : 'line-clamp-2');
      unmount();
    });
  });

  it('085 — Urgente fica junto ao título e a prioridade padrão desce para a linha de contexto', () => {
    const { rerender } = render(<WorkItemCard item={item({ priority: 'urgent' })} mode="board" />);
    const headerUrgente = screen.getByText('Ligar para o cliente').parentElement as HTMLElement;
    const urgente = within(headerUrgente).getByTestId('priority-pill');
    expect(urgente.getAttribute('data-priority')).toBe('urgent');
    expect(urgente.textContent).toBe('Urgente');

    rerender(<WorkItemCard item={item({ priority: 'high' })} mode="board" />);
    const headerComum = screen.getByText('Ligar para o cliente').parentElement as HTMLElement;
    expect(within(headerComum).queryByTestId('priority-pill')).toBeNull();
    // existe, mas na linha de contexto (fora do header do título)
    expect(screen.getByTestId('priority-pill').getAttribute('data-priority')).toBe('high');
  });

  it('086 — prazo vencido pinta o texto de destrutivo e acrescenta a tag "Atrasada"', () => {
    const { rerender } = render(
      <WorkItemCard item={item({ due_date: '2026-09-25T10:00:00.000Z' })} mode="board" />
    );
    expect(screen.getByTestId('date-label').className).toContain('--destructive-text');
    expect(screen.getByTestId('overdue-tag').textContent).toContain('Atrasada');

    rerender(<WorkItemCard item={item({ due_date: '2026-11-20T14:00:00.000Z' })} mode="board" />);
    expect(screen.queryByTestId('overdue-tag')).toBeNull();
  });

  it('087 — no card em "Fazendo" o prazo e o lembrete ganham rótulos em duas colunas', () => {
    const { rerender } = render(
      <WorkItemCard item={item({ status: 'todo', due_date: '2026-11-20T14:00:00.000Z' })} mode="list" />
    );
    expect(screen.queryByText('Prazo')).toBeNull();
    expect(screen.queryByText('Lembrete')).toBeNull();

    rerender(
      <WorkItemCard
        item={item({ status: 'doing', due_date: '2026-11-20T14:00:00.000Z', remind_at: '2026-11-20T12:00:00.000Z' })}
        mode="list"
      />
    );
    expect(screen.getByText('Prazo')).toBeTruthy();
    expect(screen.getByText('Lembrete')).toBeTruthy();
  });

  it('087 — o prazo de hoje sai no formato único ("Hoje, 14:00") e o lembrete traz o sino âmbar', () => {
    // A recusa 1 pediu a MEDIDA, não só o rótulo. O prazo é montado em cima do
    // relógio do teste (hoje às 14h) para casar com a regra "Hoje/Ontem/Amanhã"
    // do `workItemFormat.ts` (T04) — a mesma que `DateLabel` exibe.
    const hoje14 = new Date();
    hoje14.setHours(14, 0, 0, 0);
    const hoje12 = new Date();
    hoje12.setHours(12, 0, 0, 0);

    render(
      <WorkItemCard
        item={item({ status: 'doing', due_date: hoje14.toISOString(), remind_at: hoje12.toISOString() })}
        mode="list"
      />
    );

    // Texto do prazo no formato único do módulo.
    expect(screen.getByTestId('date-label')).toHaveTextContent('Hoje, 14:00');

    // Sino do lembrete: existe, é um SVG (o Bell do primitivo) e o ícone está
    // tingido pelo par de texto de AVISO (`--warning-text`), no lugar da cor crua
    // do primitivo — o wrapper é o único caminho porque o sino mora no RemindChip
    // (primitivo T11), fora dos arquivos deste cartão.
    const sino = screen.getByTestId('remind-chip');
    expect(sino.querySelector('svg')).toBeTruthy();
    const wrapper = sino.parentElement as HTMLElement;
    expect(wrapper.className).toContain('[&_svg]:text-[hsl(var(--warning-text))]');
  });

  it('088 — a descrição curta (2 linhas) só aparece em "Fazendo"/selecionado', () => {
    const desc = 'Cliente pediu retorno depois das 14h, com o orçamento revisado.';
    const { rerender } = render(<WorkItemCard item={item({ status: 'todo', description: desc })} mode="board" />);
    expect(screen.queryByText(desc)).toBeNull();

    rerender(<WorkItemCard item={item({ status: 'doing', description: desc })} mode="board" />);
    expect(screen.getByText(desc).className).toContain('line-clamp-2');
  });

  it('089 — em "Aguardando" o motivo vira chip âmbar, truncado e com tooltip', () => {
    const motivo = 'Retorno da transportadora';
    render(<WorkItemCard item={item({ status: 'waiting', waiting_reason: motivo })} mode="board" />);

    const chip = screen.getByTestId('waiting-chip');
    expect(chip.getAttribute('title')).toBe(motivo);
    expect(chip.textContent).toContain(motivo);
    expect(chip.className).toContain('--warning-text');
    expect(chip.querySelector('.bg-warning')).toBeTruthy();
  });

  it('090 — card selecionado: borda primary, fundo primary/10, alça ⠿ e data-selected', () => {
    const { rerender } = render(<WorkItemCard item={item()} mode="board" />);
    expect(card().className).toContain('bg-card');
    expect(card().getAttribute('data-selected')).toBeNull();

    rerender(<WorkItemCard item={item()} mode="board" isSelected />);
    expect(card().getAttribute('data-selected')).toBe('true');
    expect(card().className).toContain('border-primary');
    expect(card().className).toContain('bg-primary/10');
    expect(card().textContent).toContain('⠿');
  });

  it('090 — a seleção do painel (TasksUiProvider.selectedId) também marca o card', () => {
    function Abrir() {
      const ui = useTasksUi();
      return <button onClick={() => ui.openPanel('t1')}>abrir painel</button>;
    }
    render(
      <TasksUiProvider>
        <Abrir />
        <WorkItemCard item={item({ id: 't1' })} mode="board" />
      </TasksUiProvider>
    );

    expect(card().getAttribute('data-selected')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'abrir painel' }));
    expect(card().getAttribute('data-selected')).toBe('true');
    expect(card().className).toContain('bg-primary/10');
  });

  it('090 — o card selecionado RECEBE FOCO quando a seleção do painel muda', () => {
    function Abrir() {
      const ui = useTasksUi();
      return <button onClick={() => ui.openPanel('t1')}>abrir painel</button>;
    }
    render(
      <TasksUiProvider>
        <Abrir />
        <WorkItemCard item={item({ id: 't1' })} mode="board" />
      </TasksUiProvider>
    );

    const botao = screen.getByRole('button', { name: 'abrir painel' });
    botao.focus();
    expect(document.activeElement).toBe(botao);
    expect(card().getAttribute('data-selected')).toBeNull();

    // Seleção E FOCO sincronizados: o item passa a ser o aberto nos Detalhes e o
    // foco vai para o PRÓPRIO card — o teclado volta ao mesmo item depois de ler
    // o painel, em vez de ficar no controle que o abriu.
    fireEvent.click(botao);
    expect(card().getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(card());
  });

  it('090 — card que já NASCE selecionado (deep link ?task=) não rouba o foco da página', () => {
    render(
      <TasksUiProvider>
        <button>fora</button>
        <WorkItemCard item={item({ id: 't1' })} mode="board" isSelected />
      </TasksUiProvider>
    );

    // O efeito só age na TRANSIÇÃO para selecionado: um card montado já
    // selecionado não move o foco de quem abriu a página.
    expect(card().getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(document.body);
  });

  it('alvo ≥ 40 px: o checkbox mantém o círculo de 18 px e amplia o clique por pseudo-elemento', () => {
    render(<WorkItemCard item={item()} mode="list" onToggleDone={vi.fn()} />);
    const check = screen.getByTestId('task-checkbox');

    // O círculo VISÍVEL não muda: segue 18 px (o visual do D16).
    expect(check.className).toContain('h-[18px]');
    expect(check.className).toContain('w-[18px]');

    // O alvo é ampliado por um pseudo-elemento ancorado no próprio botão. O inset
    // sai da CLASSE REAL (não de um número solto): 18 + 2·inset ≥ 40 px.
    expect(check.className).toContain('relative');
    const inset = /before:-inset-\[(\d+)px\]/.exec(check.className);
    expect(inset).not.toBeNull();
    expect(18 + 2 * Number(inset![1])).toBeGreaterThanOrEqual(40);
    expect(check.className).toContain("before:content-['']");
  });
});
