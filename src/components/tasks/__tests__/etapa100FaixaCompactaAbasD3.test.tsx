/**
 * Etapa 100 do plano (`PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, linha
 * 359: "Faixa compacta e abas do Quadro. Faixa compacta de KPIs (imagem 05) e estilo
 * das abas conforme D3.").
 *
 * O aceite desta etapa tem DUAS pontas, e este cartão tranca as duas:
 *   · §3.5 imagem 05 — a faixa de KPIs do Quadro é a COMPACTA: cinco leituras numa
 *     linha com separadores, sem os cards de 88px (é a D2: a densidade acompanha o
 *     MODO, por prop — nada de estado novo);
 *   · D3 (linha 193) — as abas de modo são PREENCHIDAS com ícone e o modo ativo
 *     fica destacado; o estilo "abas sublinhadas" da imagem 05 foi DESCARTADO por
 *     D3, então o que se prova aqui é o botão preenchido, não o sublinhado.
 *
 * Por que este arquivo existe (e por que ele não reimplementa nada): quando este
 * cartão abriu, as duas pontas já estavam na base — a faixa compacta desde a etapa
 * 025 (`TasksKpiStrip`, densidade `'compact'` vinda do módulo) e as abas desde a D3
 * (`ModeSwitcher`). O inventário do cartão pai (t_38dd27ce,
 * `docs/tarefas/relatorio-base-quadro.md`) registrou "faixa compacta de KPIs e
 * seletor D3 já existem — não reescrever ModeSwitcher/TasksKpiStrip". O que a suíte
 * NÃO pinava era o ACEITE inteiro: que o módulo entrega a faixa compacta quando — e
 * somente quando — o modo é o Quadro, que os dois desenhos leem os mesmos números e
 * que a aba ativa é a preenchida. Cada caso abaixo morre se a decisão for desfeita;
 * a prova vermelha (mutação de cada ponta) está em `.tmp/`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';
import { TasksModule } from '@/components/tasks/TasksModule';
import { ModeSwitcher } from '@/components/tasks/shared/ModeSwitcher';
import { TooltipProvider } from '@/components/ui/tooltip';

const MODE_STORAGE_KEY = 'tasks-mode';

/** Os cinco rótulos da faixa, na ordem das etapas 016–022. */
const LEITURAS = ['Atrasadas', 'Para hoje', 'Fazendo', 'Concluídas · 7 dias', 'Tempo médio'];

function renderModule(modo: 'list' | 'board' | 'agenda') {
  localStorage.setItem(MODE_STORAGE_KEY, modo);
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** 1 atrasada · 1 para hoje · 2 fazendo · 1 concluída — os cinco cards têm leitura. */
function cenario() {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const fimDoDia = new Date();
  fimDoDia.setHours(23, 59, 0, 0);
  setSelectResult({
    data: [
      makeTaskRow({ id: 'a1', title: 'Atrasada 1', status: 'todo', due_date: ontem.toISOString() }),
      makeTaskRow({ id: 'h1', title: 'Hoje 1', status: 'todo', due_date: fimDoDia.toISOString() }),
      makeTaskRow({ id: 'd1', title: 'Fazendo 1', status: 'doing' }),
      makeTaskRow({ id: 'd2', title: 'Fazendo 2', status: 'doing' }),
      makeTaskRow({
        id: 'c1',
        title: 'Concluída 1',
        status: 'done',
        completed_at: new Date().toISOString(),
      }),
    ],
    error: null,
  });
}

/** A faixa renderizada (o módulo monta uma só por vez). */
const faixa = () => screen.getByTestId('tasks-kpi-strip');

/** Os cards da faixa, na ordem em que o módulo os monta. */
const cards = () => Array.from(faixa().querySelectorAll('[data-testid="kpi-card"]'));

/** Valor de uma leitura pelo rótulo (`n` ou `n/3` na trava de WIP). */
function valor(label: string): string {
  const card = within(faixa()).getByText(label).closest('[data-testid="kpi-card"]');
  return card?.querySelector('[data-testid="kpi-value"]')?.textContent ?? '<sem card>';
}

/** Todas as leituras na ordem contratada — é o que compara os dois desenhos. */
const leituras = () => LEITURAS.map(valor);

beforeEach(() => {
  cleanup();
  resetSupabaseMock();
  localStorage.clear();
  window.history.replaceState(null, '', '/?view=tasks');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  cleanup();
});

describe('Etapa 100 — a faixa compacta do Quadro (imagem 05, decisão D2)', () => {
  it('no Quadro a faixa é a COMPACTA: uma linha que quebra, com separadores, e sem os cards de 88px', async () => {
    cenario();
    renderModule('board');
    await screen.findByText('Fazendo 1');

    // Dentro do Quadro, a mesma leitura aparece duas vezes (na faixa e no KPI do
    // Modal/Painel não; aqui só na faixa e — no Quadro — nos cartões). Escopar a
    // busca na faixa evita casar o rótulo da coluna "Fazendo".
    const strip = faixa();
    expect(strip.getAttribute('data-density')).toBe('compact');
    // O desenho confortável (grade) fica de fora: quem manda é o modo.
    expect(strip.className).toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(strip.className).not.toMatch(/grid-cols/);

    const cinco = cards();
    expect(cinco).toHaveLength(5);

    // Separadores: um filete entre as leituras (a partir da segunda), nunca na primeira.
    const colunas = Array.from(strip.children) as HTMLElement[];
    expect(colunas).toHaveLength(5);
    expect(colunas[0].className).not.toMatch(/border-l/);
    for (const coluna of colunas.slice(1)) expect(coluna.className).toMatch(/border-l/);

    // E nada dos 88px do modo confortável: o alvo de toque é o card inteiro (>=44px).
    for (const card of cinco) {
      expect(card.getAttribute('data-density')).toBe('compact');
      expect(card.className).toMatch(/min-h-\[44px\]/);
      expect(card.className).not.toMatch(/h-\[88px\]/);
      for (const tile of card.querySelectorAll('[data-testid="kpi-tile"]')) {
        expect(tile.className).toMatch(/h-7 w-7/);
      }
    }

    // A válvula do "sem estouro horizontal": a faixa QUEBRA em vez de rolar.
    expect(strip.className).not.toMatch(/overflow-x/);
  });

  it('fora do Quadro (Lista e Agenda) a faixa é a confortável, na grade de 2/3/5 colunas', async () => {
    for (const modo of ['list', 'agenda'] as const) {
      cleanup();
      resetSupabaseMock();
      cenario();
      renderModule(modo);
      await screen.findByTestId('tasks-kpi-strip');

      const strip = faixa();
      // A faixa confortável não carrega o marcador: quem o lê é o DADO de cada
      // card (`data-density="comfortable"`) — o marcador no contêiner só existe no
      // desenho compacto, e é ele que a imagem 05 pede.
      expect(strip.getAttribute('data-density'), `modo ${modo}`).toBeNull();
      expect(strip.className).toMatch(/grid-cols-2/);
      expect(strip.className).toMatch(/md:grid-cols-3/);
      expect(strip.className).toMatch(/xl:grid-cols-5/);

      const cinco = cards();
      expect(cinco).toHaveLength(5);
      for (const card of cinco) {
        expect(card.getAttribute('data-density')).toBe('comfortable');
        expect(card.className).toMatch(/h-\[88px\]/);
      }
    }
  });

  it('os dois desenhos leem os MESMOS números: muda a densidade, não o dado', async () => {
    cenario();
    renderModule('list');
    await screen.findByTestId('tasks-kpi-strip');
    const confortavel = leituras();

    cleanup();
    resetSupabaseMock();
    cenario();
    renderModule('board');
    await screen.findByText('Fazendo 1');
    const compacta = leituras();

    // As quatro leituras determinísticas do cenário (o "Tempo médio" depende do
    // relógio — `completed_at` de agora contra `created_at` do fixture —, então só
    // se prova que ele existe e que as duas densidades concordam nele).
    expect(confortavel.slice(0, 4)).toEqual(['1', '1', '2/3', '1']);
    expect(confortavel[4]).not.toBe('<sem card>');
    expect(compacta).toEqual(confortavel);
  });
});

describe('Etapa 100 — as abas de modo seguem a decisão D3 (preenchidas com ícone)', () => {
  /** O preenchimento do modo ativo é a pílula `bg-primary` por trás do botão. */
  const preenchida = (aba: Element) =>
    Array.from(aba.querySelectorAll('*')).some(el =>
      /(^|\s)bg-primary(\s|$)/.test(el.getAttribute('class') ?? '')
    );

  it('três abas, cada uma com ícone; a ativa é a preenchida e anuncia aria-pressed', () => {
    const { container } = render(<ModeSwitcher mode="board" onChange={() => {}} />);

    const abas = Array.from(container.querySelectorAll('button'));
    expect(abas.map(a => a.textContent?.trim())).toEqual(['Lista', 'Quadro', 'Agenda']);

    // D3 "preenchido com ícone": toda aba traz o próprio ícone.
    for (const aba of abas) expect(aba.querySelector('svg'), `${aba.textContent} sem ícone`).toBeTruthy();

    const ativa = abas.filter(a => a.getAttribute('aria-pressed') === 'true');
    expect(ativa).toHaveLength(1);
    expect(ativa[0].getAttribute('aria-label')).toBe('Quadro');
    expect(preenchida(ativa[0])).toBe(true);
    expect(ativa[0].className).toMatch(/text-primary-foreground/);

    // As inativas não ganham preenchimento nenhum — não há duas pílulas na tela.
    for (const aba of abas.filter(a => a !== ativa[0])) {
      expect(aba.getAttribute('aria-pressed')).toBe('false');
      expect(preenchida(aba), `${aba.textContent} não pode nascer preenchida`).toBe(false);
    }
  });

  it('o preenchimento anda junto com o modo: só a aba do modo corrente fica cheia', () => {
    const { container, rerender } = render(<ModeSwitcher mode="list" onChange={() => {}} />);
    const abas = () => Array.from(container.querySelectorAll('button'));

    expect(abas().find(a => a.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label')).toBe('Lista');
    expect(abas().filter(preenchida)).toHaveLength(1);

    rerender(<ModeSwitcher mode="agenda" onChange={() => {}} />);
    expect(abas().find(a => a.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label')).toBe('Agenda');
    expect(abas().filter(preenchida)).toHaveLength(1);
  });
});
