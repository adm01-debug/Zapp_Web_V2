/**
 * Etapa 069 (D16–D22) — primitivos de `src/components/tasks/shared/`.
 *
 * Uma implementação por peça, usada por Lista, Quadro, Agenda, painel e modal:
 *   · TaskCheckbox  — checkbox CIRCULAR (D16: as imagens divergiam no formato).
 *   · PriorityPill  — pílula de prioridade, uma cor por prioridade (D12).
 *   · StatusPill    — pílula de estado, uma cor por estado.
 *   · DateLabel     — data pelo rótulo ÚNICO de `workItemFormat.ts` (D21).
 *   · ContactAvatar — foto com a inicial como fallback determinístico.
 *   · TasksUiContext— seleção, painel, modal e densidade num só lugar, para as
 *                     superfícies não precisarem reabrir `TasksModule.tsx`.
 *
 * Os testes trancam COMPORTAMENTO (clique, rótulo, teclado, fallback) e a
 * AMARRAÇÃO de token (cada prioridade/estado casa com o seu par de cor); a
 * pílula de prioridade lê os rótulos de `workItemLabels.ts` — nunca de um
 * arquivo de componente.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { TaskCheckbox } from '@/components/tasks/shared/TaskCheckbox';
import { PriorityPill } from '@/components/tasks/shared/PriorityPill';
import { StatusPill } from '@/components/tasks/shared/StatusPill';
import { DateLabel } from '@/components/tasks/shared/DateLabel';
import { ContactAvatar } from '@/components/tasks/shared/ContactAvatar';
import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { formatWorkItemDate } from '@/hooks/tasks/workItemFormat';
import { getAvatarColor } from '@/lib/avatar-colors';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import type { Priority, WorkItemStatus } from '@/hooks/tasks/workItem.types';

afterEach(() => cleanup());

/** 11/10/2026 12:00 no fuso LOCAL — a mesma régua que `workItemFormat` usa. */
const AGORA = new Date(2026, 9, 11, 12, 0);
const HOJE_14H = new Date(2026, 9, 11, 14, 0);
const ONTEM_17H = new Date(2026, 9, 10, 17, 0);
const AMANHA_10H = new Date(2026, 9, 12, 10, 0);

// ───────────────────────────────────────────────────────────────── TaskCheckbox

describe('TaskCheckbox — um checkbox circular para o módulo inteiro', () => {
  it('é CIRCULAR (D16) e alterna pelo clique', () => {
    const onToggle = vi.fn();
    render(<TaskCheckbox done={false} onToggle={onToggle} />);
    const cb = screen.getByTestId('task-checkbox');

    expect(cb.className).toContain('rounded-full');
    expect(cb.className).not.toContain('rounded-[4px]');
    expect(cb.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(cb);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('guardado: aria-checked=true, nome "Reabrir tarefa" e a marca aparece', () => {
    render(<TaskCheckbox done onToggle={() => {}} />);
    const cb = screen.getByRole('checkbox', { name: 'Reabrir tarefa' });
    expect(cb.getAttribute('aria-checked')).toBe('true');
    expect(cb.querySelector('svg')).toBeTruthy();
  });

  it('desabilitado não dispara e sai do tab', () => {
    const onToggle = vi.fn();
    render(<TaskCheckbox done={false} onToggle={onToggle} disabled />);
    const cb = screen.getByTestId('task-checkbox') as unknown as HTMLButtonElement;
    expect(cb.disabled).toBe(true);
    fireEvent.click(cb);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('é <button> NATIVO (Enter/Espaço e foco ficam por conta do navegador) e não vaza o clique para o card', () => {
    const doCard = vi.fn();
    const onToggle = vi.fn();
    render(
      <div onClick={doCard}>
        <TaskCheckbox done={false} onToggle={onToggle} />
      </div>,
    );
    const cb = screen.getByTestId('task-checkbox');
    expect(cb.tagName).toBe('BUTTON');
    // foco: o anel é do foco visível, então o elemento precisa poder receber foco
    cb.focus();
    expect(document.activeElement).toBe(cb);

    fireEvent.click(cb);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(doCard).not.toHaveBeenCalled();
  });

  it('tem alvo de toque de 40 px com o círculo visual de 18 px dentro (regra de tela)', () => {
    render(<TaskCheckbox done={false} onToggle={() => {}} />);
    const botao = screen.getByTestId('task-checkbox'); // o elemento interativo
    const circulo = screen.getByTestId('task-checkbox-circle'); // só o desenho

    // o alvo é o próprio <button>: 40x40 (h-10 = w-10 = 40px)
    expect(botao.tagName).toBe('BUTTON');
    expect(botao.className).toContain('h-10');
    expect(botao.className).toContain('w-10');
    expect(botao.className).not.toContain('h-[18px]');
    expect(botao.className).not.toContain('w-[18px]');

    // o desenho encolheu para 18 px e é decorativo (não é o alvo, não tem nome)
    expect(circulo.className).toContain('h-[18px]');
    expect(circulo.className).toContain('w-[18px]');
    expect(circulo.getAttribute('aria-hidden')).toBe('true');
    expect(circulo.getAttribute('role')).toBeNull();
  });

  it('sem violação de acessibilidade (axe)', async () => {
    const { container } = render(<TaskCheckbox done onToggle={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ────────────────────────────────────────────────────────────────── PriorityPill

describe('PriorityPill — prioridade com o rótulo de workItemLabels e uma cor por valor', () => {
  it('mostra o rótulo pt-BR de cada prioridade (fonte: workItemLabels.ts)', () => {
    for (const p of Object.keys(PRIORITY_LABELS) as Priority[]) {
      const { unmount } = render(<PriorityPill priority={p} />);
      expect(screen.getByTestId('priority-pill').textContent).toBe(PRIORITY_LABELS[p]);
      unmount();
    }
    // o acento do rótulo não se perde pelo caminho
    expect(PRIORITY_LABELS.medium).toBe('Média');
  });

  it('cada prioridade casa com o seu PAR DE COR (tokens de texto, D12)', () => {
    const classes = (p: Priority) => {
      const { unmount } = render(<PriorityPill priority={p} />);
      const cls = screen.getByTestId('priority-pill').className;
      unmount();
      return cls;
    };

    const alta = classes('high');
    const urgente = classes('urgent');
    const media = classes('medium');
    const baixa = classes('low');

    expect(alta).toContain('--warning-text');
    expect(urgente).toContain('--destructive-text');
    expect(media).toContain('text-primary');
    expect(baixa).toContain('text-muted-foreground');

    // quatro prioridades, quatro classes distintas
    expect(new Set([alta, urgente, media, baixa]).size).toBe(4);
  });

  it('prioridade nula ou desconhecida cai no padrão do banco (medium) sem imprimir "undefined"', () => {
    const { unmount } = render(<PriorityPill priority={null} />);
    expect(screen.getByTestId('priority-pill').textContent).toBe('Média');
    expect(screen.getByTestId('priority-pill').getAttribute('data-priority')).toBe('medium');
    unmount();

    render(<PriorityPill priority={'turbo' as unknown as Priority} />);
    expect(screen.getByTestId('priority-pill').textContent).toBe('Média');
  });

  it('compacto vira a inicial, mas o nome acessível continua completo', () => {
    render(<PriorityPill priority="medium" compact />);
    const pill = screen.getByTestId('priority-pill');
    expect(pill.textContent).toBe('M');
    expect(pill.getAttribute('role')).toBe('img');
    expect(pill.getAttribute('aria-label')).toBe('Média');
  });

  it('compacto não tem violação de acessibilidade (axe)', async () => {
    const { container } = render(<PriorityPill priority="high" compact />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem violação de acessibilidade (axe)', async () => {
    const { container } = render(<PriorityPill priority="urgent" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ──────────────────────────────────────────────────────────────────── StatusPill

describe('StatusPill — estado com rótulo e cor próprios', () => {
  it('rotula os seis estados (os cinco do quadro + cancelada)', () => {
    const esperado: Record<WorkItemStatus, string> = {
      backlog: 'Caixa de entrada',
      todo: 'A fazer',
      doing: 'Fazendo',
      waiting: 'Aguardando',
      done: 'Concluído',
      cancelled: 'Cancelada',
    };
    for (const s of Object.keys(esperado) as WorkItemStatus[]) {
      const { unmount } = render(<StatusPill status={s} />);
      expect(screen.getByTestId('status-pill').textContent).toBe(esperado[s]);
      unmount();
    }
  });

  it('cada estado tem a sua cor e "Fazendo"/"Aguardando" usam o par certo', () => {
    const classes = (s: WorkItemStatus) => {
      const { unmount } = render(<StatusPill status={s} />);
      const cls = screen.getByTestId('status-pill').className;
      unmount();
      return cls;
    };
    const todos = (['backlog', 'todo', 'doing', 'waiting', 'done', 'cancelled'] as WorkItemStatus[]).map(classes);
    expect(new Set(todos).size).toBe(6);

    expect(classes('doing')).toContain('bg-primary');
    expect(classes('waiting')).toContain('--warning-text');
    expect(classes('done')).toContain('bg-success');
    expect(classes('cancelled')).toContain('line-through');
  });

  it('sem violação de acessibilidade (axe)', async () => {
    const { container } = render(<StatusPill status="waiting" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ──────────────────────────────────────────────────────────────────── DateLabel

describe('DateLabel — a regra ÚNICA de datas (workItemFormat.ts)', () => {
  it('reusa formatWorkItemDate: Hoje/Ontem/Amanhã com hora, no fuso local', () => {
    const { unmount } = render(<DateLabel value={HOJE_14H} now={AGORA} />);
    expect(screen.getByTestId('date-label').textContent).toBe(formatWorkItemDate(HOJE_14H, { now: AGORA }));
    expect(screen.getByTestId('date-label').textContent).toBe('Hoje, 14:00');
    unmount();

    const { unmount: u2 } = render(<DateLabel value={ONTEM_17H} now={AGORA} />);
    expect(screen.getByTestId('date-label').textContent).toBe('Ontem, 17:00');
    u2();

    render(<DateLabel value={AMANHA_10H} now={AGORA} />);
    expect(screen.getByTestId('date-label').textContent).toBe('Amanhã, 10:00');
  });

  it("format='day' mostra só o dia (caso das concluídas)", () => {
    render(<DateLabel value={HOJE_14H} now={AGORA} format="day" />);
    expect(screen.getByTestId('date-label').textContent).toBe('Hoje');
  });

  it('vazio vira "Sem prazo" em vez de string vazia', () => {
    render(<DateLabel value={null} now={AGORA} />);
    const label = screen.getByTestId('date-label');
    expect(label.textContent).toBe('Sem prazo');
    expect(label.getAttribute('data-empty')).toBe('true');
  });

  it('atrasado usa o par de TEXTO destrutivo; "Hoje" usa o de aviso', () => {
    const { unmount } = render(<DateLabel value={ONTEM_17H} now={AGORA} overdue />);
    expect(screen.getByTestId('date-label').className).toContain('--destructive-text');
    unmount();

    render(<DateLabel value={HOJE_14H} now={AGORA} />);
    expect(screen.getByTestId('date-label').className).toContain('--warning-text');
  });

  it('o ícone de calendário é decorativo e não infla o nome acessível', async () => {
    const { container } = render(<DateLabel value={HOJE_14H} now={AGORA} />);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ───────────────────────────────────────────────────────────────── ContactAvatar

describe('ContactAvatar — foto com a inicial como fallback', () => {
  it('com foto: <img> com o src dado e alt vazio (a imagem é decorativa)', () => {
    render(<ContactAvatar name="Maria Clara" avatarUrl="https://x/foto.png" />);
    const img = screen.getByTestId('contact-avatar').querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://x/foto.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(screen.getByTestId('contact-avatar').getAttribute('aria-label')).toBe('Maria Clara');
  });

  it('sem foto: iniciais sobre a cor determinística de getAvatarColor', () => {
    const { bg, text } = getAvatarColor('Maria Clara');
    render(<ContactAvatar name="Maria Clara" />);
    const el = screen.getByTestId('contact-avatar');
    expect(el.textContent).toBe('MC');
    expect(el.className).toContain(bg);
    expect(el.className).toContain(text);
    expect(el.querySelector('img')).toBeNull();
  });

  it('nome ausente não quebra o avatar', () => {
    render(<ContactAvatar name={null} />);
    expect(screen.getByTestId('contact-avatar').textContent).toBe('?');
  });

  it('sem violação de acessibilidade (axe)', async () => {
    const { container } = render(<ContactAvatar name="Maria Clara" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ──────────────────────────────────────────────────────────────── TasksUiContext

function Sonda() {
  const ui = useTasksUi();
  return (
    <div>
      <span data-testid="sel">{ui.selectedId ?? '—'}</span>
      <span data-testid="painel">{String(ui.panelOpen)}</span>
      <span data-testid="modal">{String(ui.modalOpen)}</span>
      <span data-testid="densidade">{ui.density}</span>
      <button type="button" onClick={() => ui.openPanel('t-1')}>abrir</button>
      <button type="button" onClick={() => ui.closePanel()}>fechar</button>
      <button type="button" onClick={() => ui.openModal()}>novo</button>
      <button type="button" onClick={() => ui.closeModal()}>fechar-modal</button>
      <button type="button" onClick={() => ui.setDensity('compact')}>compacto</button>
      <button type="button" onClick={() => ui.setDensity('comfortable')}>confortável</button>
    </div>
  );
}

describe('TasksUiContext — um estado de UI para as superfícies não reabrirem TasksModule', () => {
  it('fora do provider, useTasksUi falha com a mensagem que manda envolver', () => {
    const silencioso = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Sonda />)).toThrow(/TasksUiProvider/);
    silencioso.mockRestore();
  });

  it('começa vazio e confortável, e abre/fecha painel e modal', () => {
    render(
      <TasksUiProvider>
        <Sonda />
      </TasksUiProvider>,
    );
    expect(screen.getByTestId('sel').textContent).toBe('—');
    expect(screen.getByTestId('painel').textContent).toBe('false');
    expect(screen.getByTestId('modal').textContent).toBe('false');
    expect(screen.getByTestId('densidade').textContent).toBe('comfortable');

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    expect(screen.getByTestId('sel').textContent).toBe('t-1');
    expect(screen.getByTestId('painel').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
    expect(screen.getByTestId('sel').textContent).toBe('—');
    expect(screen.getByTestId('painel').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'novo' }));
    expect(screen.getByTestId('modal').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'fechar-modal' }));
    expect(screen.getByTestId('modal').textContent).toBe('false');
  });

  it('a densidade começa confortável (padrão) e muda em tempo de execução', () => {
    render(
      <TasksUiProvider>
        <Sonda />
      </TasksUiProvider>,
    );
    expect(screen.getByTestId('densidade').textContent).toBe('comfortable');
    fireEvent.click(screen.getByRole('button', { name: 'compacto' }));
    expect(screen.getByTestId('densidade').textContent).toBe('compact');
    fireEvent.click(screen.getByRole('button', { name: 'confortável' }));
    expect(screen.getByTestId('densidade').textContent).toBe('comfortable');
  });

  it('initialDensity define a densidade inicial do provedor', () => {
    render(
      <TasksUiProvider initialDensity="compact">
        <Sonda />
      </TasksUiProvider>,
    );
    expect(screen.getByTestId('densidade').textContent).toBe('compact');
  });

  it('sem violação de acessibilidade (axe)', async () => {
    const { container } = render(
      <TasksUiProvider>
        <Sonda />
      </TasksUiProvider>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
