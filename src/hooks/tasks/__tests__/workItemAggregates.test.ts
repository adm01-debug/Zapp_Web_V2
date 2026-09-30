import { describe, it, expect } from 'vitest';
import { startOfDay } from 'date-fns';
import { bucketByDue, bucketByStatus, kpis, dueLabel, weekBuckets, dayGroupLabel, groupUpcomingByDay, splitDoneByRecency, applyFilters, temHora, agendaDayDots, groupAgendaDay } from '../workItemAggregates';
import { DEFAULT_FILTERS } from '../workItemFilters';
import type { WorkItem } from '../workItem.types';

const now = new Date('2026-10-03T12:00:00Z');

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Test',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: now.toISOString(),
    completed_at: null,
    contact_id: null,
    created_by: 'p1',
    assigned_to: 'p1',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe('applyFilters (etapas 45/46 — os filtros valem nos três modos)', () => {
  const base: WorkItem[] = [
    makeItem({ id: 'a', title: 'Ligar para a Ana', priority: 'urgent' }),
    makeItem({ id: 'b', title: 'Enviar orçamento', priority: 'low', remind_at: '2026-10-04T09:00:00Z' }),
    makeItem({ id: 'c', title: 'Ligar de novo', priority: 'high', contact: { id: 'c1', name: 'Ana', phone: null, avatar_url: null } }),
    makeItem({ id: 'd', title: 'Já feita', status: 'done', completed_at: '2026-10-02T10:00:00Z' }),
  ];
  const ids = (items: WorkItem[]) => items.map(i => i.id);

  it('sem filtro nenhum devolve tudo, inclusive as concluídas', () => {
    expect(ids(applyFilters(base, DEFAULT_FILTERS))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a busca casa o título sem diferenciar maiúsculas e ignora espaços das pontas', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, q: '  LIGAR ' }))).toEqual(['a', 'c']);
  });

  it('prioridade recorta pela prioridade exata', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, prio: 'urgent' }))).toEqual(['a']);
  });

  it('contato recorta pelo id do contato da tarefa', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, contact: 'c1' }))).toEqual(['c']);
  });

  it('"com alarme" só deixa o que tem lembrete marcado', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, alarm: true }))).toEqual(['b']);
  });

  it('esconder as concluídas tira as `done` dos três modos', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, done: false }))).toEqual(['a', 'b', 'c']);
  });

  it('os filtros somam (E, não OU)', () => {
    expect(ids(applyFilters(base, { ...DEFAULT_FILTERS, q: 'ligar', prio: 'high' }))).toEqual(['c']);
    expect(applyFilters(base, { ...DEFAULT_FILTERS, q: 'ligar', prio: 'high', done: false })).toHaveLength(1);
  });
});

describe('etapa 55 — Agenda: pontos do dia e os 3 grupos', () => {
  it('temHora separa prazo com hora de prazo de dia inteiro', () => {
    expect(temHora(null)).toBe(false);
    expect(temHora(new Date(2026, 9, 3, 0, 0).toISOString())).toBe(false);
    expect(temHora(new Date(2026, 9, 3, 14, 30).toISOString())).toBe(true);
  });

  it('dots: prazo, alarme e atrasada — no máximo 3', () => {
    const vazio = { reminders: [], dueTasks: [] };
    expect(agendaDayDots(vazio, 0)).toEqual([]);
    expect(agendaDayDots({ reminders: [makeItem({}), ], dueTasks: [makeItem({})] }, 0))
      .toEqual(['bg-primary', 'bg-warning']);
    expect(agendaDayDots({ reminders: [makeItem({})], dueTasks: [makeItem({})] }, 2))
      .toEqual(['bg-primary', 'bg-warning', 'bg-destructive']);
  });

  it('o item com prazo E alarme no mesmo dia entra nos dois grupos (DoD)', () => {
    const dois = makeItem({
      id: 'dois',
      remind_at: new Date(2026, 9, 3, 9, 0).toISOString(),
      due_date:  new Date(2026, 9, 3, 18, 0).toISOString(),
    });
    const soAlarme = makeItem({ id: 'alarme', remind_at: new Date(2026, 9, 3, 8, 0).toISOString() });
    const diaInteiro = makeItem({ id: 'dia', due_date: new Date(2026, 9, 3, 0, 0).toISOString() });
    const comHora = makeItem({ id: 'hora', due_date: new Date(2026, 9, 3, 15, 0).toISOString() });

    const g = groupAgendaDay({ reminders: [soAlarme, dois], dueTasks: [dois, diaInteiro, comHora] });

    expect(g.alarmes.map(i => i.id)).toEqual(['alarme', 'dois']);   // ordenado por remind_at
    expect(g.prazos.map(i => i.id)).toEqual(['dois', 'hora']);      // dia inteiro sai daqui
    expect(g.semHora.map(i => i.id)).toEqual(['dia']);
    expect(g.alarmes).toContain(g.prazos[0]);                       // o mesmo objeto nos dois
  });
});

describe('bucketByDue', () => {
  it('classifica atrasada corretamente', () => {
    const item = makeItem({ due_date: '2026-10-01T10:00:00Z' }); // 2 dias atrás
    const b = bucketByDue([item], now);
    expect(b.overdue).toHaveLength(1);
    expect(b.today).toHaveLength(0);
  });

  it('classifica hoje', () => {
    const item = makeItem({ due_date: '2026-10-03T08:00:00Z' }); // hoje
    const b = bucketByDue([item], now);
    expect(b.today).toHaveLength(1);
  });

  it('classifica amanhã', () => {
    const item = makeItem({ due_date: '2026-10-04T08:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.tomorrow).toHaveLength(1);
  });

  it('classifica sem prazo', () => {
    const item = makeItem({ due_date: null });
    const b = bucketByDue([item], now);
    expect(b.noDue).toHaveLength(1);
  });

  it('done7d inclui concluída na semana', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-29T10:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.done7d).toHaveLength(1);
  });

  it('done7d exclui concluída > 7 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-24T10:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.done7d).toHaveLength(0);
  });

  it('doneOlder inclui concluída entre 8 e 30 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-20T10:00:00Z' }); // 13 dias atrás
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(1);
    expect(b.done7d).toHaveLength(0);
  });

  it('doneOlder exclui concluída dentro dos 7 dias (fica em done7d)', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-10-02T10:00:00Z' }); // 1 dia
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(0);
    expect(b.done7d).toHaveLength(1);
  });

  it('doneOlder exclui concluída com mais de 30 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-08-20T10:00:00Z' }); // 44 dias
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(0);
    expect(b.done7d).toHaveLength(0);
  });

  it('exclui done de active buckets', () => {
    const item = makeItem({ status: 'done', due_date: '2026-10-01T10:00:00Z', completed_at: now.toISOString() });
    const b = bucketByDue([item], now);
    expect(b.overdue).toHaveLength(0);
  });
});

describe('bucketByStatus', () => {
  it('distribui por status', () => {
    const items = [
      makeItem({ status: 'doing' }),
      makeItem({ status: 'doing' }),
      makeItem({ status: 'todo' }),
    ];
    const b = bucketByStatus(items);
    expect(b.doing).toHaveLength(2);
    expect(b.todo).toHaveLength(1);
    expect(b.backlog).toHaveLength(0);
  });

  it('ordena por position depois priority', () => {
    const items = [
      makeItem({ status: 'todo', position: 2, priority: 'low' }),
      makeItem({ status: 'todo', position: 0, priority: 'high' }),
      makeItem({ status: 'todo', position: 1, priority: 'medium' }),
    ];
    const b = bucketByStatus(items);
    expect(b.todo[0].position).toBe(0);
    expect(b.todo[1].position).toBe(1);
    expect(b.todo[2].position).toBe(2);
  });
});

describe('kpis', () => {
  it('conta overdue, dueToday, doingCount, done7d', () => {
    const items = [
      makeItem({ status: 'doing' }),
      makeItem({ due_date: '2026-10-01T10:00:00Z' }), // overdue
      makeItem({ due_date: '2026-10-03T10:00:00Z' }), // today
      makeItem({ status: 'done', completed_at: '2026-09-29T10:00:00Z' }),
    ];
    const k = kpis(items, now);
    expect(k.overdue).toBe(1);
    expect(k.dueToday).toBe(1);
    expect(k.doingCount).toBe(1);
    expect(k.done7d).toBe(1);
  });

  it('avgCycleTimeDays null sem dados', () => {
    const k = kpis([], now);
    expect(k.avgCycleTimeDays).toBeNull();
  });
});

describe('dueLabel', () => {
  it('retorna Atrasada para data passada', () => {
    const { overdue } = dueLabel('2026-10-01T10:00:00Z', now);
    expect(overdue).toBe(true);
  });
  it('retorna Hoje para hoje', () => {
    const { label } = dueLabel('2026-10-03T08:00:00Z', now);
    expect(label).toBe('Hoje');
  });
  it('retorna Amanhã para amanhã', () => {
    const { label } = dueLabel('2026-10-04T08:00:00Z', now);
    expect(label).toMatch(/amanh/i);
  });
});

describe('weekBuckets', () => {
  it('distribui por dia de remind_at e due_date', () => {
    // Datas construidas em hora LOCAL: o mesmo caso passa em UTC e em UTC-3.
    const start = new Date(2026, 9, 6);            // segunda 06/10 as 00:00 locais
    const items = [
      makeItem({ remind_at: new Date(2026, 9, 6, 9, 0).toISOString() }),
      makeItem({ due_date: new Date(2026, 9, 7, 0, 0).toISOString() }),
    ];
    const wb = weekBuckets(items, start);
    expect(wb[0].reminders).toHaveLength(1); // seg
    expect(wb[1].dueTasks).toHaveLength(1);  // ter
  });

  it('a tarefa das 23:59 locais fica no dia LOCAL, o mesmo que a Lista chama de "Hoje"', () => {
    const due   = new Date(2026, 9, 1, 23, 59);   // 01/10 as 23:59 locais
    const wb    = weekBuckets([makeItem({ due_date: due.toISOString() })], startOfDay(due));
    expect(wb[0].dueTasks).toHaveLength(1);
    expect(wb[1].dueTasks).toHaveLength(0);

    // ...e a Lista concorda: o mesmo instante e "Hoje", nao "amanha".
    const b = bucketByDue([makeItem({ due_date: due.toISOString() })], due);
    expect(b.today).toHaveLength(1);
    expect(b.tomorrow).toHaveLength(0);
  });

  it('o lembrete das 23:59 locais fica no dia LOCAL, nao no seguinte', () => {
    const rem = new Date(2026, 9, 1, 23, 59);
    const wb  = weekBuckets([makeItem({ remind_at: rem.toISOString() })], startOfDay(rem));
    expect(wb[0].reminders).toHaveLength(1);
    expect(wb[1].reminders).toHaveLength(0);
  });

  it('a meia-noite local abre o proprio dia (nao fecha o anterior)', () => {
    const wb = weekBuckets(
      [makeItem({ due_date: new Date(2026, 9, 2, 0, 0).toISOString() })],
      new Date(2026, 9, 1)
    );
    expect(wb[0].dueTasks).toHaveLength(0); // 01/10 fica vazio
    expect(wb[1].dueTasks).toHaveLength(1); // 02/10 recebe
  });

  it('data invalida e ignorada, nao derruba a Agenda', () => {
    const wb = weekBuckets([makeItem({ due_date: 'nao-e-data' })], new Date(2026, 9, 1));
    expect(wb.every(w => w.dueTasks.length === 0)).toBe(true);
  });
});

describe('etapa 49 — "Próximas" agrupada por dia', () => {
  // `now` = sábado 03/10/2026 (12h: o mesmo dia em UTC ou em UTC-3).
  it('rotula o dia: Hoje, Amanhã, o dia da semana (dentro de 7 dias) e "Semana que vem" (> 7 dias)', () => {
    expect(dayGroupLabel('2026-10-03T12:00:00Z', now)).toBe('Hoje');
    expect(dayGroupLabel('2026-10-04T12:00:00Z', now)).toBe('Amanhã');
    expect(dayGroupLabel('2026-10-05T12:00:00Z', now)).toBe('Seg 05/10');
    expect(dayGroupLabel('2026-10-10T12:00:00Z', now)).toBe('Sáb 10/10'); // hoje + 7
    expect(dayGroupLabel('2026-10-11T12:00:00Z', now)).toBe('Semana que vem'); // hoje + 8
  });

  it('agrupa por dia na ordem prazo → prioridade', () => {
    const grupos = groupUpcomingByDay([
      makeItem({ id: 'z', due_date: '2026-10-12T09:00:00Z', priority: 'urgent' }),
      makeItem({ id: 'b', due_date: '2026-10-05T15:00:00Z', priority: 'low' }),
      makeItem({ id: 'a', due_date: '2026-10-05T09:00:00Z', priority: 'urgent' }),
    ], now);

    expect(grupos.map(g => g.label)).toEqual(['Seg 05/10', 'Semana que vem']);
    expect(grupos[0].items.map(i => i.id)).toEqual(['a', 'b']); // mesmo dia: prazo mais cedo primeiro
    expect(grupos[1].items.map(i => i.id)).toEqual(['z']);
  });

  it('desempata o mesmo horário por prioridade', () => {
    const grupos = groupUpcomingByDay([
      makeItem({ id: 'low', due_date: '2026-10-05T09:00:00Z', priority: 'low' }),
      makeItem({ id: 'urg', due_date: '2026-10-05T09:00:00Z', priority: 'urgent' }),
    ], now);

    expect(grupos[0].items.map(i => i.id)).toEqual(['urg', 'low']);
  });
});

describe('etapa 51 — splitDoneByRecency (coluna Concluído do Quadro)', () => {
  const done = (id: string, completed_at: string | null) =>
    makeItem({ id, status: 'done', completed_at });

  it('recent = só os 7 dias, na ordem completed_at desc', () => {
    const { recent, older } = splitDoneByRecency([
      done('antigaDaSemana', '2026-09-28T10:00:00Z'), // 5 dias
      done('ontem',          '2026-10-02T10:00:00Z'), // 1 dia
      done('duasSemanas',    '2026-09-20T10:00:00Z'), // 13 dias
      done('mesPassado',     '2026-08-20T10:00:00Z'), // 44 dias
    ], now);

    expect(recent.map(i => i.id)).toEqual(['ontem', 'antigaDaSemana']);
    expect(older.map(i => i.id)).toEqual(['duasSemanas']);
  });

  it('older vai do mais recente ao mais antigo e para no teto de 30 dias', () => {
    const { older } = splitDoneByRecency([
      done('a', '2026-09-10T10:00:00Z'), // 23 dias
      done('b', '2026-09-25T10:00:00Z'), // 8 dias
      done('c', '2026-08-01T10:00:00Z'), // 63 dias — fora da janela da query
    ], now);

    expect(older.map(i => i.id)).toEqual(['b', 'a']);
  });

  it('concluída sem carimbo fica na janela recente (tarefa não se esconde por falta de dado)', () => {
    const { recent, older } = splitDoneByRecency([done('semCarimbo', null)], now);

    expect(recent.map(i => i.id)).toEqual(['semCarimbo']);
    expect(older).toHaveLength(0);
  });

  it('ignora o que não está concluído', () => {
    const { recent, older } = splitDoneByRecency([makeItem({ id: 'aberta', status: 'todo' })], now);

    expect(recent).toHaveLength(0);
    expect(older).toHaveLength(0);
  });
});
