/**
 * A3 — sondas da Agenda (etapas 55/56/57 + F2).
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
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
const local = (v: string | null) => { if (!v) return String(v); const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function renderAgenda(items: WorkItem[], overdue: WorkItem[] = [], onCreate = vi.fn().mockResolvedValue(undefined)) {
  render(
    <TooltipProvider>
      <TasksAgendaMode
        items={items} overdue={overdue} isLoading={false} onCreate={onCreate as any}
        onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()}
      />
    </TooltipProvider>,
  );
  return onCreate;
}
const btnDia = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off);
  return screen.getByRole('button', { name: new RegExp(`^${d.getDate()} de`, 'i') }); };

describe('a3 Agenda', () => {
  it('estado da faixa: dias de hoje+0..+6', () => {
    renderAgenda([]);
    out.dias = screen.getAllByRole('button').map(b => b.getAttribute('aria-label')).filter(Boolean);
    out.chipSemTitulo = screen.queryByTestId('quick-add-due')?.textContent ?? null;
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'x' } });
    out.prazoInicial = screen.getByTestId('quick-add-due').textContent;
    out.placeholder = (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder;
    expect(true).toBe(true);
  });

  it('chip manual + trocar de dia (chip sobrescrito?) e voltar', async () => {
    const onCreate = renderAgenda([]);
    const hojeEsperado = local(hojeTs(23, 59));
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'rascunho' } });
    fireEvent.click(screen.getByTestId('quick-add-chip-tomorrow'));
    out.chipTroca = { antes: screen.getByTestId('quick-add-due').textContent };
    fireEvent.click(btnDia(3));
    out.chipTroca.depoisDeTrocarPara3 = screen.queryByTestId('quick-add-due')?.textContent ?? null;
    out.chipTroca.prazoDoDia3 = local(hojeTs(23, 59, 3));
    out.chipTroca.campoPreservado = (screen.getByTestId('quick-add-input') as HTMLInputElement).value;
    fireEvent.click(btnDia(0));
    out.chipTroca.voltouParaHoje = screen.queryByTestId('quick-add-due')?.textContent ?? null;
    out.chipTroca.hoje = hojeEsperado;
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    out.chipTroca.prazoEnviado = local(onCreate.mock.calls[0][0].dueDate);
    expect(true).toBe(true);
  });

  it('trocar de dia e criar: dia certo? (DoD etapa 57)', async () => {
    const onCreate = renderAgenda([]);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'no dia 4' } });
    fireEvent.click(btnDia(4));
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    out.doD57 = { enviado: local(onCreate.mock.calls[0][0].dueDate), esperado: local(hojeTs(23, 59, 4)), status: onCreate.mock.calls[0][0].status };
    // 2o create no mesmo dia 4
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: '2o no dia 4' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    out.doD57.segundo = local(onCreate.mock.calls[1][0].dueDate);
    expect(true).toBe(true);
  });

  it('contagem: cabecalhos, noDia e a regra dos 23:59 (Sem hora)', () => {
    // a) item criado pela UI (23:59 local) -> Sem hora
    const ui = makeItem({ title: 'UI 23:59', due_date: hojeTs(23, 59) });
    // b) item com hora -> Prazos
    const comHora = makeItem({ title: 'Com hora 18:00', due_date: hojeTs(18, 0) });
    // c) item com prazo E alarme no mesmo dia -> nos dois grupos
    const dois = makeItem({ title: 'Prazo e alarme', due_date: hojeTs(18, 0), remind_at: hojeTs(9, 30) });
    // d) meia-noite local -> Sem hora
    const meiaNoite = makeItem({ title: 'Meia-noite', due_date: hojeTs(0, 0) });
    renderAgenda([ui, comHora, dois, meiaNoite]);
    const grupos: any = {};
    for (const nome of ['Alarmes', 'Prazos', 'Sem hora']) {
      const reg = screen.getByRole('region', { name: nome });
      grupos[nome] = { titulo: reg.querySelector('h3')?.textContent, itens: Array.from(reg.querySelectorAll('[data-testid="work-item-card"]')).map(c => (c as HTMLElement).getAttribute('aria-label')?.split(',')[0]) };
    }
    out.contagem = { grupos, vazio: screen.queryByText('Nenhuma tarefa neste dia') !== null, ordemH3: Array.from(document.querySelectorAll('section[aria-label] h3')).map(h => h.textContent) };
    expect(true).toBe(true);
  });

  it('aria-controls e id duplicado', () => {
    renderAgenda([], [makeItem({ title: 'Velha', due_date: hojeTs(9, 0, -3) })]);
    const botao = screen.getByRole('button', { name: /1 atrasada/i });
    const alvo = document.getElementById('agenda-atrasadas')!;
    const conteudo = botao.parentElement?.querySelector('.mt-2') ?? null;
    out.aria = {
      ariaControls: botao.getAttribute('aria-controls'),
      alvoEhAncestralDoBotao: alvo.contains(botao),
      alvoContemConteudoQueAbre: !!conteudo && alvo.contains(conteudo),
      conteudoTemId: conteudo ? (conteudo as HTMLElement).id || '(sem id)' : 'conteudo ausente (colapsado)',
      alvoTag: alvo.tagName, alvoId: alvo.id,
      tagDoConteudo: conteudo ? conteudo.tagName : null,
    };
    out.aria.idsNoDocumento = Array.from(document.querySelectorAll('[id="agenda-atrasadas"]')).length;
    expect(true).toBe(true);
  });

  it('DUAS agendas na mesma tela', () => {
    render(
      <TooltipProvider>
        <div>
          <TasksAgendaMode items={[]} overdue={[makeItem({ title: 'A', due_date: hojeTs(9, 0, -3) })]} isLoading={false} onCreate={vi.fn() as any} onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()} />
          <TasksAgendaMode items={[]} overdue={[makeItem({ title: 'B', due_date: hojeTs(9, 0, -3) })]} isLoading={false} onCreate={vi.fn() as any} onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()} />
        </div>
      </TooltipProvider>,
    );
    const dup = document.querySelectorAll('[id="agenda-atrasadas"]');
    out.idDuplicado = { ocorrencias: dup.length, idsIguais: Array.from(dup).map(e => e.getAttribute('aria-controls')) };
    expect(true).toBe(true);
  });

  it('dump', () => { writeFileSync('/tmp/a3-agenda.json', JSON.stringify(out, null, 2)); expect(true).toBe(true); });
});
