/**
 * A3 — sonda 4: o MESMO cenario de corrida no codigo PRE-F2 (baseline).
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksAgendaMode as AgendaAntiga } from './AgendaOld';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const out: any = {};
const local = (v: string | null | undefined) => { if (!v) return String(v); const d = new Date(v); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const btnDia = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off); return screen.getByRole('button', { name: new RegExp(`^${d.getDate()} de`, 'i') }); };
const hojeTs = (h: number, m = 0, dOff = 0) => { const d = new Date(); d.setDate(d.getDate() + dOff); d.setHours(h, m, 0, 0); return d.toISOString(); };

describe('a3 sonda4 (PRE-F2)', () => {
  it('corrida no codigo antigo', async () => {
    let resolver: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>(res => { resolver = res; }));
    render(<TooltipProvider><AgendaAntiga items={[] as WorkItem[]} overdue={[]} isLoading={false} onCreate={onCreate as any}
      onOpen={vi.fn()} onToggleDone={vi.fn()} onMoveTo={vi.fn()} onDelete={vi.fn()} /></TooltipProvider>);

    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'tarefa' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    fireEvent.click(btnDia(3));
    resolver();
    await new Promise(r => setTimeout(r, 30));
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'segunda' } });
    out.preF2 = {
      placeholder: (screen.getByTestId('quick-add-input') as HTMLInputElement).placeholder,
      chipPrazo: screen.queryByTestId('quick-add-due')?.textContent ?? null,
    };
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    out.preF2.prazoEnviado2 = local(onCreate.mock.calls[1][0].dueDate);
    out.preF2.esperadoDia3 = local(hojeTs(23, 59, 3));
    resolver();
    writeFileSync('/tmp/a3-sonda4.json', JSON.stringify(out, null, 2));
    expect(true).toBe(true);
  });
});
