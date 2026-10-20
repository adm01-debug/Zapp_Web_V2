/**
 * A3 — sonda 2: corrida do create em voo + ordenacao + blindagem do chip + TZ.
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
import { PriorityChip } from '@/components/tasks/shared/PriorityChip';
import { groupAgendaDay, temHora, weekBuckets } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const out: any = {};
let seq = 0;
function makeItem(over: Partial<WorkItem>): WorkItem {
  seq += 1;
  return {
    id: `i${seq}`, title: `T${seq}`, description: null, status: 'todo', priority: 'medium',
    due_date: null, remind_at: null, notified_at: null, waiting_reason: null, position: 0,
    started_at: null, status_changed_at: null, completed_at: null, contact_id: null,
    created_by: 'p1', assigned_to: 'p1', created_at: '2026-09-30T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z', ...over,
  } as WorkItem;
}
const hojeTs = (h: number, m = 0, dOff = 0) => { const d = new Date(); d.setDate(d.getDate() + dOff); d.setHours(h, m, 0, 0); return d.toISOString(); };
const local = (v: string | null | undefined) => { if (!v) return String(v); const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const btnDia = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off); return screen.getByRole('button', { name: new RegExp(`^${d.getDate()} de`, 'i') }); };
function renderAgenda(items: WorkItem[], onCreate: any) {
  render(<TooltipProvider><TasksAgendaMode items={items} overdue={[]} isLoading={false} onCreate={onCreate}
    onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()} /></TooltipProvider>);
}

describe('a3 sonda2', () => {
  it('CORRIDA: trocar de dia com o create em voo', async () => {
    let resolver: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>(res => { resolver = res; }));
    renderAgenda([], onCreate);

    const campo = screen.getByTestId('quick-add-input') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'tarefa' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    out.corrida = { inputDesabilitadoDuranteCreate: (screen.getByTestId('quick-add-input') as HTMLInputElement).disabled,
      botaoDia3Habilitado: !(btnDia(3) as HTMLButtonElement).disabled,
      prazoEnviado1: local(onCreate.mock.calls[0][0].dueDate) };

    // usuario troca de dia ENQUANTO o create esta em voo
    fireEvent.click(btnDia(3));
    out.corrida.placeholderAposTroca = (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder;
    out.corrida.chipAposTroca = screen.queryByTestId('quick-add-due')?.textContent ?? null;

    resolver();
    await waitFor(() => expect((screen.getByTestId('quick-add-input') as HTMLInputElement).value).toBe(''));

    out.corrida.depoisDoResolve = {
      diaSelecionadoPlaceholder: (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder,
      chipPrazo: screen.queryByTestId('quick-add-due')?.textContent ?? null,
      prazoEsperadoDoDia3: local(hojeTs(23, 59, 3)),
      prazoDoDia0: local(hojeTs(23, 59, 0)),
    };
    // 2o create SEM tocar em nada: para onde vai?
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'segunda' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    out.corrida.prazoEnviado2 = local(onCreate.mock.calls[1][0].dueDate);
    resolver();
    expect(true).toBe(true);
  });

  it('ordenacao: Prazos por due_date, empate estavel, nulo impossivel', () => {
    const dia = new Date(); dia.setHours(0, 0, 0, 0);
    const t = (h: number, m = 0, d = 0) => { const x = new Date(dia); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
    const a = makeItem({ id: 'a', title: 'a', due_date: t(18, 0) });
    const b = makeItem({ id: 'b', title: 'b', due_date: t(9, 0) });
    const c = makeItem({ id: 'c', title: 'c', due_date: t(9, 0) });   // empate EXATO com b
    const d = makeItem({ id: 'd', title: 'd', due_date: t(12, 0) });
    const g1 = groupAgendaDay({ reminders: [], dueTasks: [a, b, c, d] });
    const g2 = groupAgendaDay({ reminders: [], dueTasks: [d, c, b, a] });
    out.ordem = {
      entrada_a_b_c_d: g1.prazos.map(i => `${i.id}@${local(i.due_date).slice(11)}`),
      entrada_d_c_b_a: g2.prazos.map(i => `${i.id}@${local(i.due_date).slice(11)}`),
      empateMantemOrdemDeEntrada: g1.prazos.filter(i => i.due_date === t(9, 0)).map(i => i.id).join(',') === 'b,c'
        && g2.prazos.filter(i => i.due_date === t(9, 0)).map(i => i.id).join(',') === 'c,b',
      dueNuloEmPrazos: (() => { const n = makeItem({ id: 'n', title: 'n', due_date: null }); return groupAgendaDay({ reminders: [], dueTasks: [n] as any }).prazos.length; })(),
      semHoraOrdenado: (() => {
        const x = makeItem({ id: 'x', due_date: t(23, 59, 1) });
        const y = makeItem({ id: 'y', due_date: t(23, 59) });
        return groupAgendaDay({ reminders: [], dueTasks: [x, y] }).semHora.map(i => i.id);
      })(),
    };

    // DoD etapa 55 depois do sort
    const dois = makeItem({ id: 'z', title: 'z', due_date: t(18, 0), remind_at: t(9, 30) });
    const gi = groupAgendaDay({ reminders: [dois], dueTasks: [dois] });
    out.doD55 = { emAlarmes: gi.alarmes.map(i => i.id), emPrazos: gi.prazos.map(i => i.id) };

    // due_date corrompido
    const corrompido = makeItem({ id: 'k', title: 'k', due_date: 'abc' });
    out.corrompido = {
      temHora: temHora('abc'),
      grupoDireto: (() => { const g = groupAgendaDay({ reminders: [], dueTasks: [corrompido] }); return { prazos: g.prazos.map(i => i.id), semHora: g.semHora.map(i => i.id) }; })(),
      nosDiasDaSemana: weekBuckets([corrompido], dia).map(w => w.dueTasks.length),
      nosDiasDaSemana_controle: weekBuckets([makeItem({ id: 'ok', due_date: t(10, 0) })], dia).map(w => w.dueTasks.length),
    };
    expect(true).toBe(true);
  });

  it('classificacao depende do fuso de quem LE', () => {
    // instante gravado em Sao Paulo: 03/10/2026 23:59 BRT
    const gravado = '2026-10-04T02:59:00.000Z';
    const d = new Date(gravado);
    out.tzLeitura = {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      instante: gravado,
      horaLocalDeQuemLe: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      diaLocalDeQuemLe: local(gravado).slice(0, 10),
      temHora: temHora(gravado),
    };
    expect(true).toBe(true);
  });

  it('PriorityChip: nulo, desconhecido e chaves do prototype', () => {
    const casos: any[] = [null, undefined, 'medium', 'xyz', 'constructor', 'toString', 'hasOwnProperty'];
    render(<div>{casos.map((p, i) => <PriorityChip key={i} priority={p} />)}</div>);
    out.priority = casos.map((p, i) => {
      const el = document.querySelectorAll('span')[i] as HTMLElement;
      return { entrada: String(p), texto: el.textContent, title: el.getAttribute('title'), classe: el.className };
    });
    expect(true).toBe(true);
  });

  it('dump', () => { writeFileSync('/tmp/a3-sonda2.json', JSON.stringify(out, null, 2)); expect(true).toBe(true); });
});
