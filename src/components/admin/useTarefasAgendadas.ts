import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseHelpers';
import { describeAccessError, isAccessDeniedError } from '@/lib/rlsError';

/**
 * Linha da agenda do banco exibida na aba "Tarefas agendadas".
 *
 * Os campos vêm da RPC `admin_list_cron_jobs()`. O texto do COMANDO SQL do job
 * (`cron.job.command`) não existe aqui de propósito: a RPC não o devolve e a tela
 * não pode mostrá-lo.
 */
export interface TarefaAgendada {
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_run_at: string | null;
  last_return_message: string | null;
}

// A RPC devolve o texto cru do `RAISE EXCEPTION` (ex.: "admin_list_cron_jobs:
// acesso restrito a administradores"). Nada disso vai para a tela: negação de
// acesso vira a mensagem fixa do helper (sem nome de função, tabela ou policy) e
// o resto vira um texto genérico.
function mensagemDeErro(error: unknown): string {
  if (isAccessDeniedError(error)) return describeAccessError(error);
  return 'Não foi possível falar com a agenda do banco. Tente novamente.';
}

// A mesma chave para a aba toda: cada troca de aba remonta o componente, e o
// cache do react-query evita reconsultar o banco a cada clique (staleTime).
export const CHAVE_TAREFAS_AGENDADAS = ['admin-cron-jobs'] as const;

export function useTarefasAgendadas() {
  const [alterando, setAlterando] = useState<string | null>(null);
  // Trava de reentrada: sem ela, dois cliques no interruptor disparariam duas
  // chamadas de `admin_toggle_cron_job` para o mesmo job.
  const emAndamento = useRef(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: CHAVE_TAREFAS_AGENDADAS,
    queryFn: async (): Promise<TarefaAgendada[]> => {
      const { data: linhas, error: erroConsulta } = await supabase.rpc('admin_list_cron_jobs');
      // O erro cru (com nome de função/policy) NUNCA é exibido: ele sobe e é
      // traduzido por `mensagemDeErro` antes de chegar à tela.
      if (erroConsulta) throw erroConsulta;

      return (linhas ?? []).map((linha) => ({
        jobname: linha.jobname,
        schedule: linha.schedule,
        active: linha.active,
        last_status: linha.last_status ?? null,
        last_run_at: linha.last_run_at ?? null,
        last_return_message: linha.last_return_message ?? null,
      }));
    },
    staleTime: 30_000,
  });

  const recarregar = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const alternar = useCallback(
    async (jobname: string, ativo: boolean) => {
      if (emAndamento.current) return false;
      emAndamento.current = true;
      setAlterando(jobname);

      const { error: erroAlteracao } = await supabase.rpc('admin_toggle_cron_job', {
        p_jobname: jobname,
        p_ativo: ativo,
      });

      emAndamento.current = false;
      setAlterando(null);

      if (erroAlteracao) {
        toast.error(mensagemDeErro(erroAlteracao));
        return false;
      }

      toast.success(ativo ? `Tarefa "${jobname}" ativada.` : `Tarefa "${jobname}" pausada.`);
      // Recarrega em silêncio: a lista já está na tela e o interruptor acabou de
      // mudar — não faz sentido trocá-la por um esqueleto.
      await refetch();
      return true;
    },
    [refetch],
  );

  return {
    tarefas: data ?? [],
    carregando: isLoading,
    erro: error ? mensagemDeErro(error) : null,
    alterando,
    recarregar,
    alternar,
  };
}
