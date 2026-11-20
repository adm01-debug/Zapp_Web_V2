import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ScheduledReportForm {
  name: string;
  report_type: string;
  frequency: string;
  recipients: string[];
}

/**
 * Fonte de dados do widget de Relatórios Agendados do dashboard (versão leve,
 * sem edição nem "enviar agora" — ver ScheduledReportsManager.tsx). Extraído
 * do componente para não importar `supabase` direto em `src/components`
 * (regra do lint `no-restricted-imports`).
 */
export function useScheduledReportConfigs() {
  const qc = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_report_configs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Memo do próximo envio: espelha a regra da edge (send-scheduled-report) para
  // que o cron do pg_cron eleja a config no momento correto.
  const calculateNextSendAt = (frequency: string): string | null => {
    const next = new Date();
    switch (frequency) {
      case 'daily': next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break;
      case 'weekly': next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break;
      case 'biweekly': next.setDate(next.getDate() + 14); next.setHours(8, 0, 0, 0); break;
      case 'monthly': next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break;
      // custom é sob demanda (botão "Enviar agora") — nunca agenda.
      default: return null;
    }
    return next.toISOString();
  };

  const createConfig = useMutation({
    mutationFn: async (form: ScheduledReportForm) => {
      const { error } = await supabase.from('scheduled_report_configs').insert({
        name: form.name, report_type: form.report_type, frequency: form.frequency, recipients: form.recipients, is_active: true,
        next_send_at: calculateNextSendAt(form.frequency),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Relatório criado com sucesso');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('scheduled_report_configs').update({ is_active: !isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-reports'] }),
  });

  // DASH-083: dispara a edge imediatamente (configId). A edge resolve o tipo,
  // valida o papel/cron e atualiza last_sent_at; em `custom` o next_send_at
  // permanece null (continua elegível pelo cron como "nunca agendado").
  const sendNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('send-scheduled-report', {
        body: { configId: id },
      });
      if (error) throw error;
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || 'Falha ao enviar relatório');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Relatório enviado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); toast.success('Relatório removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { configs, isLoading, createConfig, toggleActive, sendNow, deleteConfig };
}
