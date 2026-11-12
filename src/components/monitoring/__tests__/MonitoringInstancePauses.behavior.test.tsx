import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Painel "Pausas de instância" (IP1 + IP2, C121): componente, hook e service REAIS, com o
 * client do Supabase mockado. Prova pela TELA:
 *   - a lista de pausas (estado, motivo, automática) e o contador de pendentes;
 *   - "Marcar investigada" chama a RPC `mark_pause_investigated` com id e notas aparadas
 *     (em branco vira null) e relê a lista;
 *   - notas fora do CHECK do banco (> 1000 ou com < >) são recusadas SEM chamar a RPC;
 *   - erro da RPC vira mensagem pt-BR (sem repassar o texto cru do banco);
 *   - estados carregando, vazio e erro de leitura com "Tentar de novo".
 */

const h = vi.hoisted(() => ({
  limit: vi.fn(),
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        order: (column: string, opts: unknown) => ({
          limit: (n: number) => h.limit(table, columns, column, opts, n),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => h.rpc(...args),
  },
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => h.toastSuccess(m), error: vi.fn() } }));
vi.mock('@/lib/logger', () => {
  const noop = () => {};
  return {
    getLogger: () => ({ error: noop, warn: noop, info: noop, debug: noop }),
    log: { error: noop, warn: noop, info: noop, debug: noop },
  };
});

import { MonitoringInstancePauses } from '@/components/monitoring/MonitoringInstancePauses';
import { PAUSE_NOTES_MAX_LENGTH } from '@/services/instance-pauses.service';

// React Query: cliente novo por render mantém os casos isolados (sem cache entre testes).
function renderPanel(props: { enabled?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MonitoringInstancePauses {...props} />
    </QueryClientProvider>,
  );
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const rawPause = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  instance: 'inst-a',
  paused_until: minutesFromNow(30),
  reason: 'limite de envio',
  auto: false,
  resumed_at: null,
  created_at: minutesFromNow(-10),
  investigated_at: null,
  investigation_notes: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.limit.mockResolvedValue({ data: [rawPause()], error: null });
  h.rpc.mockResolvedValue({
    data: { id: 'p1', investigated_at: minutesFromNow(0), investigation_notes: 'ok', ja_investigada: false },
    error: null,
  });
});
afterEach(cleanup);

describe('MonitoringInstancePauses', () => {
  it('lê instance_pauses (mais recentes primeiro, limitado) e mostra estado, motivo e automática', async () => {
    h.limit.mockResolvedValue({
      data: [
        rawPause(),
        rawPause({ id: 'p2', instance: 'inst-b', auto: true, paused_until: minutesFromNow(-5), reason: 'ban', resumed_at: minutesFromNow(-3) }),
      ],
      error: null,
    });
    renderPanel();

    const list = await screen.findByRole('list', { name: 'Pausas de instância' });
    expect(h.limit).toHaveBeenCalledWith(
      'instance_pauses',
      expect.stringContaining('investigated_at'),
      'created_at',
      { ascending: false },
      50,
    );
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('inst-a')).toBeTruthy();
    expect(within(rows[0]).getByText('Pausada')).toBeTruthy();
    expect(within(rows[1]).getByText('Retomada')).toBeTruthy();
    expect(within(rows[1]).getByText('Automática')).toBeTruthy();
    expect(screen.getByLabelText('2 pausas sem investigação')).toBeTruthy();
  });

  it('marca investigada: chama a RPC com notas aparadas, relê a lista e avisa', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    fireEvent.change(screen.getByLabelText(/Notas da investigação/), { target: { value: '  log do provedor conferido  ' } });
    h.limit.mockResolvedValue({
      data: [rawPause({ investigated_at: minutesFromNow(0), investigation_notes: 'log do provedor conferido' })],
      error: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('mark_pause_investigated', {
        p_pause_id: 'p1',
        p_notes: 'log do provedor conferido',
      }),
    );
    expect(await screen.findByText(/Investigada/)).toBeTruthy();
    expect(screen.getByText(/Notas: log do provedor conferido/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atualizar notas' })).toBeTruthy();
    expect(h.limit).toHaveBeenCalledTimes(2);
    expect(h.toastSuccess).toHaveBeenCalledWith('Pausa de inst-a marcada como investigada.');
  });

  it('nota em branco vira null (sem apagar a anterior no banco)', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('mark_pause_investigated', { p_pause_id: 'p1', p_notes: null }),
    );
  });

  it('recusa notas > 1000 ou com < > sem chamar a RPC', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    const field = screen.getByLabelText(/Notas da investigação/);

    fireEvent.change(field, { target: { value: '<script>x</script>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/< ou >/);

    fireEvent.change(field, { target: { value: 'a'.repeat(PAUSE_NOTES_MAX_LENGTH + 1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/passam de 1000/);

    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('erro 42501 da RPC vira mensagem pt-BR e mantém o formulário aberto', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sem_permissao_para_investigar_pausa' } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Só administradores e supervisores podem marcar uma pausa como investigada.');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('P0002 (pausa sumiu) e erro desconhecido têm mensagens próprias', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'pausa_nao_encontrada' } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/não existe mais/);

    h.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation "x" does not exist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Não foi possível marcar a pausa como investigada.'),
    );
  });

  it('cancelar fecha o formulário sem chamar a RPC', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Marcar investigada' })).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('estado vazio: nenhuma pausa registrada', async () => {
    h.limit.mockResolvedValue({ data: [], error: null });
    renderPanel();
    expect(await screen.findByText('Nenhuma pausa de instância registrada.')).toBeTruthy();
  });

  it('erro de leitura mostra o alerta e "Tentar de novo" relê', async () => {
    h.limit.mockResolvedValueOnce({ data: null, error: { message: 'relation "instance_pauses" does not exist' } });
    renderPanel();
    const alert = await screen.findByText('Falha na leitura');
    expect(alert).toBeTruthy();
    // a mensagem crua do banco não vaza para a tela
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.getByText('Não foi possível carregar as pausas de instância.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByText('inst-a')).toBeTruthy();
    expect(screen.queryByText('Falha na leitura')).toBeNull();
  });

  it('carregando: skeleton acessível até a primeira leitura', async () => {
    let resolve!: (v: unknown) => void;
    h.limit.mockReturnValue(new Promise(r => { resolve = r; }));
    renderPanel();
    expect(screen.getByText('Carregando as pausas de instância…')).toBeTruthy();
    resolve({ data: [], error: null });
    await screen.findByText('Nenhuma pausa de instância registrada.');
  });

  it('enabled=false não lê o banco', () => {
    renderPanel({ enabled: false });
    expect(h.limit).not.toHaveBeenCalled();
  });

  it('sem violações de acessibilidade com a lista e o formulário abertos', async () => {
    const { container } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar investigada' }));
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
