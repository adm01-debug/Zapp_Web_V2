/**
 * R2-QUE-005 (#452 / P2) — prova no consumidor real.
 *
 * O `QueueGoalsDialog` monta com o `useQueueGoals` REAL sobre um `supabase`
 * mockado que RECUSA a gravacao (o erro explicito `42501` previsto na
 * auditoria: o `UPDATE ... .eq('queue_id', ...)` e o `INSERT` devolvem
 * `{ error }`).
 *
 * Antes da correcao, `saveGoal` engolia o erro no `catch` e resolvia
 * normalmente, e o `handleSave` fechava o dialogo incondicionalmente: o
 * rascunho saia de tela depois de uma gravacao recusada. Depois da correcao,
 * a recusa mantem o formulario aberto com o rascunho preservado e o aviso de
 * sucesso ("Metas salvas") so aparece quando a gravacao e confirmada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const goalRow = {
  id: 'g1',
  queue_id: 'q1',
  // Valor do banco DIFERENTE do padrao do formulario (10): assim o teste sabe
  // que o rascunho veio do fetch e nao do getDefaultGoal.
  max_waiting_contacts: 20,
  max_avg_wait_minutes: 15,
  min_assignment_rate: 80,
  max_messages_pending: 50,
  alerts_enabled: true,
};

/** Erro 42501 do Postgres/RLS: a gravacao foi explicitamente recusada. */
type WriteError = { message: string; code: string } | null;

const write = vi.hoisted(() => ({ failWith: null as WriteError }));

const toastSpy = vi.hoisted(() => vi.fn());

const db = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => (
      table === 'queue_goals'
        ? { select: db.select, update: db.update, insert: db.insert }
        : { select: db.select }
    ),
    channel: (...args: unknown[]) => db.channel(...args),
    removeChannel: (...args: unknown[]) => db.removeChannel(...args),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { QueueGoalsDialog } from '@/components/queues/QueueGoalsDialog';

function renderDialog(queueId: string) {
  const onOpenChange = vi.fn();
  render(
    <QueueGoalsDialog
      open
      onOpenChange={onOpenChange}
      queueId={queueId}
      queueName="Suporte"
      queueColor="#3B82F6"
    />
  );
  return onOpenChange;
}

describe('QueueGoalsDialog — salvar metas nao fecha o formulario quando a gravacao falha (R2-QUE-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    write.failWith = null;
    db.select.mockResolvedValue({ data: [goalRow], error: null });
    db.update.mockReturnValue({ eq: db.eq });
    db.eq.mockImplementation(() => Promise.resolve({ error: write.failWith }));
    db.insert.mockImplementation(() => Promise.resolve({ error: write.failWith }));
    db.channel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    });
  });

  it('UPDATE recusado: mantem o formulario aberto, preserva o rascunho e avisa o erro', async () => {
    write.failWith = {
      message: 'new row violates row-level security policy for table "queue_goals"',
      code: '42501',
    };
    const onOpenChange = renderDialog('q1');

    // O rascunho carrega do banco (fetch real do hook): 20 vem da linha do
    // banco, o padrao do formulario seria 10.
    await waitFor(() => expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(20));
    // Rascunho novo, digitado pelo usuario antes de salvar.
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '25' } });
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(25);

    fireEvent.click(screen.getByRole('button', { name: /salvar metas/i }));

    // A gravacao foi tentada no caminho de UPDATE, com o escopo da fila.
    await waitFor(() => expect(db.update).toHaveBeenCalled());
    expect(db.eq).toHaveBeenCalledWith('queue_id', 'q1');
    // O usuario foi avisado da recusa.
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );

    // O defeito: o dialogo fechava mesmo com a gravacao recusada.
    expect(onOpenChange).not.toHaveBeenCalled();
    // O rascunho continua na tela, editavel, e o botao volta ao estado normal.
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(25);
    expect(screen.getByRole('button', { name: /salvar metas/i })).toBeEnabled();
    // Nada de confirmacao de sucesso numa gravacao recusada.
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Metas salvas' }));
  });

  it('INSERT recusado (fila ainda sem meta): mantem o formulario aberto', async () => {
    write.failWith = {
      message: 'permission denied for table queue_goals',
      code: '42501',
    };
    const onOpenChange = renderDialog('q2');

    await waitFor(() => expect(db.select).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /salvar metas/i }));

    await waitFor(() => expect(db.insert).toHaveBeenCalled());
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /salvar metas/i })).toBeEnabled();
  });

  it('gravacao confirmada: fecha o formulario e confirma o sucesso (comportamento que nao pode regredir)', async () => {
    const onOpenChange = renderDialog('q1');

    await waitFor(() => expect(db.select).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /salvar metas/i }));

    await waitFor(() => expect(db.update).toHaveBeenCalled());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Metas salvas' }));
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
