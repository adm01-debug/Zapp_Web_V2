/**
 * A3 — sondas do QuickAdd (F2). Prova com execucao real.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickAdd } from '@/components/tasks/shared/QuickAdd';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';

const out: any = { eventos: [] as string[] };
const reg = (k: string, v: any) => { out[k] = v; };

const unhandled: string[] = [];
process.on('unhandledRejection', (r: any) => unhandled.push(String(r && r.message ? r.message : r)));

const iso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
const hoje2359 = () => { const x = new Date(); x.setHours(23, 59, 0, 0); return x.toISOString(); };
const amanha2359 = () => { const x = new Date(Date.now() + 86400000); x.setHours(23, 59, 0, 0); return x.toISOString(); };
const local = (v: string | null) => { if (!v) return String(v); const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

describe('a3 QuickAdd', () => {
  it('2o e 3o create seguidos (Agenda, defaultDueDate=hoje23:59)', async () => {
    const onAdd = vi.fn(async () => {});
    render(<QuickAdd onAdd={onAdd as any} defaultStatus="todo" defaultDueDate={hoje2359()} />);

    for (const t of ['Primeira', 'Segunda', 'Terceira']) {
      fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: t } });
      fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
      await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(['Primeira', 'Segunda', 'Terceira'].indexOf(t) + 1));
    }
    reg('2o3o', onAdd.mock.calls.map(c => ({ title: (c[0] as WorkItemInput).title, due: local((c[0] as WorkItemInput).dueDate), campoLimpo: null })));
    reg('campoVazioApos', (screen.getByTestId('quick-add-input') as HTMLInputElement).value);
    expect(true).toBe(true);
  });

  it('create com erro (onAdd rejeita): campo e prazo sao limpos?', async () => {
    const onAdd = vi.fn(async () => { throw new Error('boom'); });
    render(<QuickAdd onAdd={onAdd as any} defaultStatus="todo" defaultDueDate={hoje2359()} />);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'Falha' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 30));
    const campo = screen.getByTestId('quick-add-input') as HTMLInputElement;
    reg('erro', {
      tituloNoCampo: campo.value,
      campoDesabilitado: campo.disabled,
      chipPrazo: screen.queryByTestId('quick-add-due')?.textContent ?? null,
      botaoCriarVisivel: !!screen.queryByRole('button', { name: /criar/i }),
    });
    // 2a tentativa depois do erro
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    reg('erro2aTentativa', { title: onAdd.mock.calls[1][0].title, due: local(onAdd.mock.calls[1][0].dueDate) });
    expect(true).toBe(true);
  });

  it('chip manual + Escape', async () => {
    const onAdd = vi.fn(async () => {});
    render(<QuickAdd onAdd={onAdd as any} defaultStatus="todo" defaultDueDate={hoje2359()} />);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('quick-add-chip-tomorrow'));
    reg('chipAmanhaAntes', screen.getByTestId('quick-add-due').textContent);
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Escape' });
    reg('escape', { campo: (screen.getByTestId('quick-add-input') as HTMLInputElement).value, chipDepoisDoEsc: screen.queryByTestId('quick-add-due')?.textContent ?? null });

    // recria e envia para ver qual prazo vai
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'Y' } });
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    reg('escapePrazoEnviado', { due: local(onAdd.mock.calls[0][0].dueDate), esperadoAmanha: local(amanha2359()), esperadoHoje: local(hoje2359()) });
    expect(true).toBe(true);
  });

  it('chip manual + Enter (chip vence o padrao?)', async () => {
    const onAdd = vi.fn(async () => {});
    render(<QuickAdd onAdd={onAdd as any} defaultStatus="todo" defaultDueDate={hoje2359()} />);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('quick-add-chip-tomorrow'));
    fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    reg('chipVence', { due: local(onAdd.mock.calls[0][0].dueDate), amanha: local(amanha2359()) });
    expect(true).toBe(true);
  });

  it('defaultDueDate muda para null depois de nao-nulo', async () => {
    function Host({ inicial }: { inicial: string | null }) {
      const [d, setD] = useState<string | null>(inicial);
      return (<div>
        <button data-testid="zerar" onClick={() => setD(null)}>zerar</button>
        <button data-testid="definir" onClick={() => setD(hoje2359())}>definir</button>
        <QuickAdd onAdd={async () => {}} defaultDueDate={d} />
      </div>);
    }
    render(<Host inicial={hoje2359()} />);
    fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: 'rascunho' } });
    reg('defaultNonNull', screen.queryByTestId('quick-add-due')?.textContent ?? null);
    fireEvent.click(screen.getByTestId('zerar'));
    reg('defaultNull', { chip: screen.queryByTestId('quick-add-due')?.textContent ?? null, campo: (screen.getByTestId('quick-add-input') as HTMLInputElement).value });
    fireEvent.click(screen.getByTestId('definir'));
    reg('defaultVoltaNaoNulo', { chip: screen.queryByTestId('quick-add-due')?.textContent ?? null });
    expect(true).toBe(true);
  });

  it('sem defaultDueDate (Lista/Quadro): 2o create continua sem prazo', async () => {
    const onAdd = vi.fn(async () => {});
    render(<QuickAdd onAdd={onAdd as any} defaultStatus="backlog" />);
    for (const t of ['A', 'B']) {
      fireEvent.change(screen.getByTestId('quick-add-input'), { target: { value: t } });
      fireEvent.keyDown(screen.getByTestId('quick-add-input'), { key: 'Enter' });
      await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(t === 'A' ? 1 : 2));
    }
    reg('semDefault', onAdd.mock.calls.map(c => ({ title: c[0].title, due: c[0].dueDate, status: c[0].status })));
    expect(true).toBe(true);
  });

  it('escreve o dump', async () => {
    await new Promise(r => setTimeout(r, 50));
    reg('unhandledRejections', unhandled);
    const { writeFileSync } = await import('node:fs');
    writeFileSync('/tmp/a3-quickadd.json', JSON.stringify(out, null, 2));
    expect(true).toBe(true);
  });
});
