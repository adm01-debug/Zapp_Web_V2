/**
 * A3 — sonda 3: a contradicao visivel da corrida + avisos do React.
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode } from '@/components/tasks/agenda/TasksAgendaMode';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const out: any = { warnings: [] as string[] };
const origError = console.error;
console.error = (...a: any[]) => { out.warnings.push(a.map(String).join(' ').slice(0, 200)); origError(...a); };

const local = (v: string | null | undefined) => { if (!v) return String(v); const d = new Date(v); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const btnDia = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off); return screen.getByRole('button', { name: new RegExp(`^${d.getDate()} de`, 'i') }); };
const hojeTs = (h: number, m = 0, dOff = 0) => { const d = new Date(); d.setDate(d.getDate() + dOff); d.setHours(h, m, 0, 0); return d.toISOString(); };

function renderAgenda(onCreate: any) {
  render(<TooltipProvider><TasksAgendaMode items={[] as WorkItem[]} overdue={[]} isLoading={false} onCreate={onCreate}
    onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()} /></TooltipProvider>);
}

describe('a3 sonda3', () => {
  it('CORRIDA (sucesso): placeholder do dia novo x prazo do dia velho', async () => {
    let resolver: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>(res => { resolver = res; }));
    renderAgenda(onCreate);

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'tarefa' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    fireEvent.click(btnDia(3));            // troca de dia com o create em voo
    resolver();                            // create conclui
    await waitFor(() => expect((screen.getByTestId('quick-add-input') as HTMLInputElement).value).toBe(''));

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'segunda' } });
    out.sucesso = {
      placeholder: (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder,
      chipPrazo: screen.queryByTestId('quick-add-due')?.textContent ?? null,
      diaSelecionadoAria: btnDia(3).getAttribute('aria-current'),
    };
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    out.sucesso.prazoEnviado2 = local(onCreate.mock.calls[1][0].dueDate);
    out.sucesso.esperadoDia3 = local(hojeTs(23, 59, 3));
    resolver();
    expect(true).toBe(true);
  });

  it('CORRIDA (erro): troca de dia + create que falha', async () => {
    let rejeitar: (e: any) => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>((_res, rej) => { rejeitar = rej; }));
    renderAgenda(onCreate);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'vai falhar' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    fireEvent.click(btnDia(3));
    await act(async () => { rejeitar(new Error('boom')); await new Promise(r => setTimeout(r, 20)); });
    out.erro = {
      campo: (screen.getByTestId('quick-add-input') as HTMLInputElement).value,
      placeholder: (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder,
      chipPrazo: screen.queryByTestId('quick-add-due')?.textContent ?? null,
    };
    expect(true).toBe(true);
  });

  it('troca de dia simples: nenhum aviso do React', async () => {
    const onCreate = vi.fn(async () => {});
    renderAgenda(onCreate);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'r' } });
    fireEvent.click(btnDia(5));
    fireEvent.click(btnDia(0));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    out.warningsTrocaDeDia = out.warnings.slice();
    expect(true).toBe(true);
  });

  it('dump', () => { writeFileSync('/tmp/a3-sonda3.json', JSON.stringify(out, null, 2)); expect(true).toBe(true); });
});
