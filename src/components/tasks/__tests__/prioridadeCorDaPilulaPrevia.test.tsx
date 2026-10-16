/**
 * Etapa 170 / D12 — a pílula de prioridade tem SEMPRE a cor da prioridade.
 *
 * Defeito: a pílula "Média" saía na cor primária (`primary`, azul) em vez do
 * âmbar (paleta `warning`). Na prévia do modal Nova tarefa a pílula é o
 * `PriorityPill`; a Lista e o Quadro usam o `PriorityChip`. Este teste renderiza
 * os DOIS componentes reais (sem mock de estilo) e lê a classe de cor de cada
 * prioridade, provando que nenhum deles pega cor emprestada da primária.
 *
 * Só tokens do sistema (`--warning-text`/`--destructive-text`/`--muted-foreground`),
 * que já fecham AA em claro e escuro (auditoria do `movimentoEContraste`).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PriorityChip } from '@/components/tasks/shared/PriorityChip';
import { PriorityPill } from '@/components/tasks/shared/PriorityPill';
import type { Priority } from '@/hooks/tasks/workItem.types';

const PRIORIDADES: Priority[] = ['low', 'medium', 'high', 'urgent'];

/** Classe de cor da pílula que a PRÉVIA do modal renderiza. */
function classeDaPilula(p: Priority): string {
  const { unmount } = render(<PriorityPill priority={p} />);
  const cls = screen.getByTestId('priority-pill').className;
  unmount();
  return cls;
}

/** Classe de cor do chip usado na Lista e no Quadro (e na Agenda, compacto). */
function classeDoChip(p: Priority): string {
  const { container, unmount } = render(<PriorityChip priority={p} />);
  const cls = container.firstElementChild?.className ?? '';
  unmount();
  return cls;
}

describe('D12 / etapa 170 — cor da prioridade na pílula da prévia do modal', () => {
  it('a "Média" da prévia é ÂMBAR (bg-warning/15 + --warning-text), não a primária', () => {
    const media = classeDaPilula('medium');

    expect(media).toContain('bg-warning/15');
    expect(media).toContain('text-[hsl(var(--warning-text))]');
    // O defeito: a pílula vinha na cor da primária (azul). Só o SEGMENTO
    // selecionado do controle usa `primary` (D12) — a pílula, nunca.
    expect(media).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(media).not.toMatch(/bg-primary/);
  });

  it('cada prioridade tem o seu par no PriorityPill (baixa/media/alta/urgente)', () => {
    const baixa = classeDaPilula('low');
    const media = classeDaPilula('medium');
    const alta = classeDaPilula('high');
    const urgente = classeDaPilula('urgent');

    expect(baixa).toContain('text-muted-foreground');
    expect(media).toContain('text-[hsl(var(--warning-text))]');
    // A "Alta" fica com o contorno vermelho do par de TEXTO: o âmbar é da "Média".
    expect(alta).toContain('text-[hsl(var(--destructive-text))]');
    expect(urgente).toContain('text-[hsl(var(--destructive-text))]');
    expect(urgente).toContain('bg-destructive/15');

    // o texto dos estados nunca é a cor CRUA de preenchimento
    expect(alta).not.toMatch(/(^|\s)text-destructive(\s|$)/);
    expect(media).not.toMatch(/(^|\s)text-warning(\s|$)/);
  });

  it('o PriorityChip (Lista e Quadro) usa o MESMO par por prioridade', () => {
    expect(classeDoChip('low')).toContain('text-muted-foreground');
    expect(classeDoChip('medium')).toContain('text-[hsl(var(--warning-text))]');
    expect(classeDoChip('high')).toContain('text-[hsl(var(--destructive-text))]');
    expect(classeDoChip('urgent')).toContain('text-[hsl(var(--destructive-text))]');
    expect(classeDoChip('medium')).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it('as quatro prioridades ficam com quatro classes distintas (dá para distinguir na tela)', () => {
    const pilulas = PRIORIDADES.map(classeDaPilula);
    const chips = PRIORIDADES.map(classeDoChip);

    expect(new Set(pilulas).size).toBe(4);
    expect(new Set(chips).size).toBe(4);
  });
});
