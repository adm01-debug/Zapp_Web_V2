import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Mock no LIMITE (cliente Supabase): a tela e o hook reais rodam; só o `rpc` é
// controlado pelo teste. Assim o que se prova é o comportamento do componente, não
// um mock que já traz a resposta pronta.
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CronJobsTab } from '../CronJobsTab';
// O hook usa react-query: cada render ganha um cache novo (um cliente por render),
// entao nenhum teste enxerga dado de outro.
import { TestQueryWrapper } from '@/test/mocks/queryClient';
import { toast } from 'sonner';

// Linhas no formato EXATO de `admin_list_cron_jobs()` — sem `command` (a RPC não
// devolve o SQL do job, e a tela não pode mostrá-lo).
const ATIVA = {
  jobname: 'gmail-incremental-sync',
  schedule: '*/15 * * * *',
  active: true,
  last_status: 'succeeded',
  last_run_at: '2026-10-15T12:00:00.000Z',
  last_return_message: 'sincronizacao concluida',
};

const PAUSADA = {
  jobname: 'tasks-notify-due',
  schedule: '*/5 * * * *',
  active: false,
  last_status: 'failed',
  last_run_at: '2026-10-15T11:00:00.000Z',
  last_return_message: 'timeout ao notificar',
};

const NUNCA_RODOU = {
  jobname: 'connection-health-check',
  schedule: '*/10 * * * *',
  active: false,
  last_status: null,
  last_run_at: null,
  last_return_message: null,
};

function resolverLista(linhas: unknown[]) {
  mockRpc.mockResolvedValueOnce({ data: linhas, error: null });
}

describe('CronJobsTab — leitura da agenda do banco', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anuncia o carregamento enquanto a RPC não respondeu', () => {
    mockRpc.mockReturnValue(new Promise(() => {}));
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando tarefas agendadas…');
  });

  it('consulta admin_list_cron_jobs sem argumentos', async () => {
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');
    expect(mockRpc).toHaveBeenCalledWith('admin_list_cron_jobs');
  });

  it('mostra nome, agenda, situação, última execução e resultado de cada job', async () => {
    resolverLista([ATIVA, PAUSADA, NUNCA_RODOU]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });

    expect(await screen.findByText('gmail-incremental-sync')).toBeInTheDocument();
    expect(screen.getByText('*/15 * * * *')).toBeInTheDocument();
    expect(screen.getByText('sincronizacao concluida')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();

    expect(screen.getByText('tasks-notify-due')).toBeInTheDocument();
    // PAUSADA e NUNCA_RODOU estão pausados: o rótulo aparece duas vezes.
    expect(screen.getAllByText('Pausado')).toHaveLength(2);
    expect(screen.getByText('Falha')).toBeInTheDocument();
    expect(screen.getByText('timeout ao notificar')).toBeInTheDocument();

    expect(screen.getByText('Sucesso')).toBeInTheDocument();
    expect(screen.getByText('Nunca executada')).toBeInTheDocument();
    expect(screen.getByText('Sem execução')).toBeInTheDocument();
  });

  it('as colunas são exatamente as cinco previstas — nenhuma coluna de comando', async () => {
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');

    const colunas = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(colunas).toEqual(['Nome', 'Agenda', 'Situação', 'Última execução', 'Resultado', 'Pausar/ativar']);
  });

  it('estado vazio quando a lista volta sem jobs', async () => {
    resolverLista([]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    expect(await screen.findByText('Nenhuma tarefa agendada encontrada.')).toBeInTheDocument();
  });

  it('estado de erro avisa e "Tentar de novo" refaz a consulta', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'acesso restrito a administradores' } });
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });

    const alerta = await screen.findByRole('alert');
    // A negação de acesso vira a mensagem fixa do helper: nunca ecoa o texto da RPC.
    expect(alerta).toHaveTextContent('Acesso negado. Você não tem permissão para executar esta ação.');
    expect(alerta).not.toHaveTextContent('admin');

    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/i }));
    expect(await screen.findByText('gmail-incremental-sync')).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('erro que não é de acesso tem texto genérico, sem a mensagem crua', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'relation public.foo does not exist' } });
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível falar com a agenda do banco. Tente novamente.');
    expect(alerta).not.toHaveTextContent('relation');
  });

  it('axe não acusa violação estrutural na tabela carregada', async () => {
    resolverLista([ATIVA, PAUSADA, NUNCA_RODOU]);
    const { container } = render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CronJobsTab — pausar e ativar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pausar pede confirmação e só então chama admin_toggle_cron_job', async () => {
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');

    fireEvent.click(screen.getByRole('switch', { name: 'Pausar a tarefa gmail-incremental-sync' }));

    expect(await screen.findByText('Pausar tarefa')).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledTimes(1); // ainda não alternou

    mockRpc.mockResolvedValueOnce({ data: { jobname: 'gmail-incremental-sync', ativo: false }, error: null });
    resolverLista([{ ...ATIVA, active: false }]);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_toggle_cron_job', {
        p_jobname: 'gmail-incremental-sync',
        p_ativo: false,
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarefa "gmail-incremental-sync" pausada.'));
    // Recarrega a agenda para refletir o novo estado.
    await waitFor(() => expect(screen.getByText('Pausado')).toBeInTheDocument());
  });

  it('ativar um job pausado manda p_ativo=true', async () => {
    resolverLista([PAUSADA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('tasks-notify-due');

    fireEvent.click(screen.getByRole('switch', { name: 'Ativar a tarefa tasks-notify-due' }));
    expect(await screen.findByText('Ativar tarefa')).toBeInTheDocument();

    mockRpc.mockResolvedValueOnce({ data: { jobname: 'tasks-notify-due', ativo: true }, error: null });
    resolverLista([{ ...PAUSADA, active: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_toggle_cron_job', {
        p_jobname: 'tasks-notify-due',
        p_ativo: true,
      }),
    );
  });

  it('cancelar a confirmação não chama nada', async () => {
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');

    fireEvent.click(screen.getByRole('switch', { name: 'Pausar a tarefa gmail-incremental-sync' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(mockRpc).toHaveBeenCalledTimes(1); // só a leitura inicial
  });

  it('erro ao alternar avisa e não anuncia sucesso', async () => {
    resolverLista([ATIVA]);
    render(<CronJobsTab />, { wrapper: TestQueryWrapper });
    await screen.findByText('gmail-incremental-sync');

    fireEvent.click(screen.getByRole('switch', { name: 'Pausar a tarefa gmail-incremental-sync' }));
    await screen.findByText('Pausar tarefa');
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'acesso restrito' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Acesso negado. Você não tem permissão para executar esta ação.'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
