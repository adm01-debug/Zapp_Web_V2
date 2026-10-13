import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useScheduledReports, type ScheduledReportForm } from '@/hooks/chat/useScheduledReports';

export type { ScheduledReportForm };

/**
 * Fonte de dados do widget de Relatórios Agendados do dashboard.
 *
 * Antes esta aba lia/gravava `scheduled_report_configs` — tabela que nenhuma
 * automação lê —, então o relatório aparecia na tela e nunca saía. Agora delega
 * para `useScheduledReports` (hook único): a MESMA tabela `scheduled_reports`
 * que a Edge `send-scheduled-report` lê e atualiza (`last_sent_at`/`next_send_at`).
 * Continua fora de `src/components` para respeitar `no-restricted-imports`.
 */
export function useScheduledReportConfigs() {
  const { reports, loading, saveReport, deleteReport, setReportActive, reload } = useScheduledReports();

  const createConfig = useMutation({
    mutationFn: (form: ScheduledReportForm) => saveReport(form),
    onSuccess: () => {
      reload();
      toast.success('Relatório criado com sucesso');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setReportActive(id, !isActive),
    onSuccess: () => reload(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConfig = useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      reload();
      toast.success('Relatório removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { configs: reports, isLoading: loading, createConfig, toggleActive, deleteConfig };
}
