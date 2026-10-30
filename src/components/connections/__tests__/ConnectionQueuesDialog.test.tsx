/**
 * `ConnectionQueuesDialog` — vínculo de filas de atendimento a uma conexão.
 *
 * O sujeito é o componente REAL com o seu próprio hook `useConnectionQueues`
 * real; a única dublagem é a fronteira de rede (`supabase.from`), que grava a
 * operação e responde o que o teste manda. `useQueues` é dublado porque o
 * catálogo de filas não é o alvo (tema de outro teste) e a lista é DADO do
 * teste. Assim se prova o que a tela pede ao banco e o que ela faz com a
 * resposta — inclusive a recusa da escrita.
 *
 * Cartão: falta teste de `ConnectionQueuesDialog` na V2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rows: [] as { id: string; queue_id: string }[],
  queues: [] as { id: string; name: string; color: string }[],
  selectError: null as { message: string } | null,
  writeError: null as { message: string } | null,
  /** Segura a leitura para observar o estado de carregamento. */
  gate: null as null | { promise: Promise<void>; release: () => void },
  inserts: [] as unknown[],
  deletes: [] as unknown[],
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let op: 'select' | 'insert' | 'delete' = 'select';
      const filters: unknown[][] = [];
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          filters.push(args);
          return builder;
        },
        insert: (payload: unknown) => {
          op = 'insert';
          h.inserts.push(payload);
          return builder;
        },
        delete: () => {
          op = 'delete';
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          if (op === 'insert') {
            return resolve({ error: h.writeError });
          }
          if (op === 'delete') {
            h.deletes.push(filters.map((f) => [...f]));
            return resolve({ error: h.writeError });
          }
          if (h.gate) {
            return h.gate.promise.then(() => resolve({ data: h.rows, error: h.selectError }));
          }
          resolve({ data: h.rows, error: h.selectError });
        },
      };
      return builder;
    },
  },
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: h.queues }),
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
}));

import { ConnectionQueuesDialog } from '../ConnectionQueuesDialog';

const props = {
  open: true,
  onOpenChange: vi.fn(),
  connectionId: 'conn-1',
  connectionName: 'Principal',
};

function renderDialog() {
  return render(<ConnectionQueuesDialog {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.queues = [];
  h.selectError = null;
  h.writeError = null;
  h.gate = null;
  h.inserts = [];
  h.deletes = [];
});

describe('ConnectionQueuesDialog — filas vinculadas à conexão', () => {
  it('estado vazio honesto quando não há nenhuma fila cadastrada', async () => {
    renderDialog();
    expect(
      await screen.findByText('Nenhuma fila cadastrada. Crie filas primeiro.'),
    ).toBeTruthy();
    // Sem filas não há interruptor de vínculo.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('mostra um interruptor por fila e marca com “Vinculada” só as já ligadas', async () => {
    h.queues = [
      { id: 'q1', name: 'Vendas', color: '#ff0000' },
      { id: 'q2', name: 'Suporte', color: '#00ff00' },
    ];
    h.rows = [{ id: 'l1', queue_id: 'q1' }];

    renderDialog();
    expect(await screen.findByText('Vendas')).toBeTruthy();
    expect(screen.getByText('Suporte')).toBeTruthy();

    const caixas = screen.getAllByRole('checkbox');
    expect(caixas).toHaveLength(2);
    expect(caixas[0].getAttribute('aria-checked')).toBe('true'); // Vendas vinculada
    expect(caixas[1].getAttribute('aria-checked')).toBe('false'); // Suporte não

    // Só a vinculada tem o selo.
    expect(screen.getAllByText('Vinculada')).toHaveLength(1);
  });

  it('vincular uma fila grava o vínculo e anuncia sucesso', async () => {
    h.queues = [{ id: 'q2', name: 'Suporte', color: '#00ff00' }];

    renderDialog();
    const caixa = await screen.findByRole('checkbox');
    // O back-end passa a devolver o vínculo novo — o refetch após o insert o enxerga.
    h.rows = [{ id: 'l2', queue_id: 'q2' }];

    fireEvent.click(caixa);

    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Fila vinculada'));
    expect(h.inserts).toEqual([{ whatsapp_connection_id: 'conn-1', queue_id: 'q2' }]);
    await waitFor(() => expect(screen.getAllByText('Vinculada')).toHaveLength(1));
  });

  it('desvincular uma fila apaga o vínculo e anuncia sucesso', async () => {
    h.queues = [{ id: 'q1', name: 'Vendas', color: '#ff0000' }];
    h.rows = [{ id: 'l1', queue_id: 'q1' }];

    renderDialog();
    const caixa = await screen.findByRole('checkbox');
    expect(caixa.getAttribute('aria-checked')).toBe('true');

    h.rows = []; // o delete já removeu no back-end
    fireEvent.click(caixa);

    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Fila desvinculada'));
    // Removeu filtrando pelo par conexão+fila.
    expect(h.deletes).toEqual([
      [
        ['whatsapp_connection_id', 'conn-1'],
        ['queue_id', 'q1'],
      ],
    ]);
  });

  it('falha ao gravar não mente: avisa o erro e o vínculo continua o mesmo', async () => {
    h.queues = [{ id: 'q2', name: 'Suporte', color: '#00ff00' }];
    h.writeError = { message: 'permission denied' };

    renderDialog();
    const caixa = await screen.findByRole('checkbox');
    fireEvent.click(caixa);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Erro ao atualizar vínculo'));
    expect(h.toast.success).not.toHaveBeenCalled();
    // Nada foi vinculado: o interruptor volta a ficar desmarcado.
    await waitFor(() => expect(caixa.getAttribute('aria-checked')).toBe('false'));
  });

  it('enquanto a leitura está pendente mostra carregamento, não a lista', async () => {
    h.queues = [{ id: 'q1', name: 'Vendas', color: '#ff0000' }];
    let release!: () => void;
    h.gate = { promise: new Promise<void>((resolve) => { release = resolve; }), release };

    const { container } = renderDialog();
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeTruthy());
    expect(screen.queryByText('Vendas')).toBeNull();

    release();
    expect(await screen.findByText('Vendas')).toBeTruthy();
  });
});
