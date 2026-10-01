/**
 * Etapa 85 — dentes do `WorkItemCard` que faltavam nos testes por TELA.
 *
 * Os arquivos irmãos já trancam: o Backspace não apaga e o Delete apaga
 * (`taskComponents`), os 5 grupos do kebab, o "Fazendo cheio" e as ações
 * Concluir/Cancelar/Lembrar-me (`cardAcoes`), e o contraste/altura por classe
 * (`movimentoEContraste`). Aqui ficam os buracos: os ESTADOS (concluído, em
 * espera e Agenda), as TECLAS do próprio card, as AÇÕES que param no card
 * (checkbox, contato) e o caminho LIBERADO do kebab (Abrir, mover com vaga,
 * remover alarme).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Importa o harness ANTES do módulo sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
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
    expect(screen.getByRole('button', { name: 'Concluir tarefa' })).toBeTruthy();

    rerender(<WorkItemCard item={item({ status: 'done' })} mode="list" onToggleDone={onToggleDone} />);

    const reabrir = screen.getByRole('button', { name: 'Reabrir tarefa' });
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
    const checkbox = screen.getByRole('button', { name: 'Concluir tarefa' });
    fireEvent.keyDown(checkbox, { key: 'Enter' });
    fireEvent.keyDown(checkbox, { key: 'x' });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleDone).not.toHaveBeenCalled();
  });

  it('o checkbox conclui sem abrir o card; clicar no corpo abre', () => {
    const onOpen = vi.fn();
    const onToggleDone = vi.fn();
    render(<WorkItemCard item={item()} mode="list" onOpen={onOpen} onToggleDone={onToggleDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Concluir tarefa' }));
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
});
