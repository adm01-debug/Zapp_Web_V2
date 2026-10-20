// @vitest-environment jsdom
/**
 * E18 — Contrato da fusão "Quadro → Tarefas".
 * Plano: docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md (E02 e E18).
 *
 * A fusão remove a PORTA DE ENTRADA "Quadro" do menu (`pipeline`), mas o modo
 * Quadro continua DENTRO de Tarefas. Este contrato trava esse invariante: se
 * alguém apagar o modo `board` do seletor, apagar uma coluna do quadro ou mexer
 * nos limites de WIP (doing=3 duro, todo=15, waiting=5), a fusão deixou de ser
 * uma fusão e o teste reprova.
 *
 * O esperado vem da ESPECIFICAÇÃO (bloco `*_DO_CONTRATO` abaixo), não do código
 * de produção: o teste CHAMA o componente real (render + clique) e a máquina de
 * transição real (`canTransition`), em vez de ler os arquivos como texto.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModeSwitcher } from '../../src/components/tasks/shared/ModeSwitcher';
import { KANBAN_COLUMNS, WIP_LIMITS, type WorkItemStatus } from '../../src/hooks/tasks/workItem.types';
import { canTransition } from '../../src/hooks/tasks/workItemMachine';

afterEach(cleanup);

/** Especificação da fusão: os três modos que Tarefas tem de oferecer. */
const MODOS_DO_CONTRATO: ReadonlyArray<{ rotulo: string; modo: 'list' | 'board' | 'agenda' }> = [
  { rotulo: 'Lista', modo: 'list' },
  { rotulo: 'Quadro', modo: 'board' },
  { rotulo: 'Agenda', modo: 'agenda' },
];

/** Especificação da fusão: limite de WIP por coluna (campo e valor). */
const LIMITES_DO_CONTRATO: Record<'doing' | 'todo' | 'waiting', { campo: 'hard' | 'soft'; valor: number }> = {
  doing: { campo: 'hard', valor: 3 },
  todo: { campo: 'soft', valor: 15 },
  waiting: { campo: 'soft', valor: 5 },
};

/** Especificação da fusão: as cinco colunas do Quadro, na ordem de leitura. */
const COLUNAS_DO_CONTRATO: WorkItemStatus[] = ['backlog', 'todo', 'doing', 'waiting', 'done'];

describe('contrato: Tarefas expõe Lista, Quadro e Agenda', () => {
  it('oferece exatamente os três modos do contrato e o Quadro é um deles', () => {
    const onChange = vi.fn();
    render(createElement(ModeSwitcher, { mode: 'list', onChange }));

    expect(screen.getAllByRole('button')).toHaveLength(MODOS_DO_CONTRATO.length);

    for (const { rotulo, modo } of MODOS_DO_CONTRATO) {
      const botao = screen.getByRole('button', { name: rotulo });
      onChange.mockClear();
      fireEvent.click(botao);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(modo);
    }
  });

  it('marca como ativo o modo recebido, inclusive o Quadro (board é um modo aceito)', () => {
    render(createElement(ModeSwitcher, { mode: 'board', onChange: vi.fn() }));

    for (const { rotulo, modo } of MODOS_DO_CONTRATO) {
      const botao = screen.getByRole('button', { name: rotulo });
      expect([rotulo, botao.getAttribute('aria-pressed')]).toEqual([
        rotulo,
        modo === 'board' ? 'true' : 'false',
      ]);
    }
  });
});

describe('contrato: as colunas e os limites de WIP do Quadro dentro de Tarefas', () => {
  it('mantém as cinco colunas do contrato, nesta ordem, todas descritas', () => {
    expect(KANBAN_COLUMNS.map((coluna) => coluna.status)).toEqual(COLUNAS_DO_CONTRATO);

    for (const coluna of KANBAN_COLUMNS) {
      expect([coluna.status, coluna.label.length > 0]).toEqual([coluna.status, true]);
      expect([coluna.status, coluna.shortLabel.length > 0]).toEqual([coluna.status, true]);
      expect([coluna.status, coluna.policy.length > 0]).toEqual([coluna.status, true]);
    }
  });

  it('mantém doing=3 (limite DURO), todo=15 e waiting=5 (suaves)', () => {
    for (const status of ['doing', 'todo', 'waiting'] as const) {
      const { campo, valor } = LIMITES_DO_CONTRATO[status];
      const outro = campo === 'hard' ? 'soft' : 'hard';

      expect([status, campo, WIP_LIMITS[status][campo]]).toEqual([status, campo, valor]);
      // A coluna tem UM limite só: trocar duro por suave (ou o contrário) mudaria
      // o comportamento — `doing` bloqueia a quarta tarefa, todo/waiting só avisam.
      expect([status, outro, WIP_LIMITS[status][outro]]).toEqual([status, outro, null]);
    }
  });

  it('o limite duro de doing bloqueia de verdade a transição para a coluna cheia', () => {
    const limite = LIMITES_DO_CONTRATO.doing.valor;

    expect(canTransition('todo', 'doing', { doingCount: limite - 1 })).toEqual({ ok: true });
    expect(canTransition('todo', 'doing', { doingCount: limite })).toEqual({
      ok: false,
      reason: 'wip_full',
    });
  });
});
