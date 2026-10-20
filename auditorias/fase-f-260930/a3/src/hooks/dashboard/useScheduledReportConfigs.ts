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

  const createConfig = useMutation({
    mutationFn: async (form: ScheduledReportForm) => {
      const { error } = await supabase.from('scheduled_report_configs').insert({
        name: form.name, report_type: form.report_type, frequency: form.frequency, recipients: form.recipients, is_active: true,
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

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); toast.success('Relatório removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { configs, isLoading, createConfig, toggleActive, deleteConfig };
}
