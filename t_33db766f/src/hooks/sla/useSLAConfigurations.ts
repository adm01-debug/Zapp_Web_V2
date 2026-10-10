import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

export interface SLAConfig {
  id: string;
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Crítica', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  high: { label: 'Alta', color: 'bg-warning/20 text-warning border-warning/30' },
  medium: { label: 'Média', color: 'bg-warning/20 text-warning border-warning/30' },
  low: { label: 'Baixa', color: 'bg-success/20 text-success border-success/30' },
};

const defaultForm = {
  name: '',
  first_response_minutes: 15,
  resolution_minutes: 120,
  priority: 'medium',
  is_default: false,
};

export type SLAForm = typeof defaultForm;

export function useSLAConfigurations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['sla-configurations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_configurations')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data || []) as SLAConfig[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SLAForm & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from('sla_configurations').update({
          name: values.name, first_response_minutes: values.first_response_minutes,
          resolution_minutes: values.resolution_minutes, priority: values.priority, is_default: values.is_default,
        }).eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sla_configurations').insert({
          name: values.name, first_response_minutes: values.first_response_minutes,
          resolution_minutes: values.resolution_minutes, priority: values.priority, is_default: values.is_default,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configurations'] });
      setShowDialog(false);
      setEditingId(null);
      setForm(defaultForm);
      toast.success(editingId ? 'SLA atualizado' : 'SLA criado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('sla_configurations').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ['sla-configurations'] });
      const previous = queryClient.getQueryData<SLAConfig[]>(['sla-configurations']);
      queryClient.setQueryData<SLAConfig[]>(['sla-configurations'], old =>
        (old || []).map(c => c.id === id ? { ...c, is_active } : c)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['sla-configurations'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sla-configurations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sla_configurations').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['sla-configurations'] });
      const previous = queryClient.getQueryData<SLAConfig[]>(['sla-configurations']);
      queryClient.setQueryData<SLAConfig[]>(['sla-configurations'], old =>
        (old || []).filter(c => c.id !== id)
      );
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['sla-configurations'], context.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configurations'] });
      toast.success('SLA removido');
    },
  });

  const openEdit = (cfg: SLAConfig) => {
    setEditingId(cfg.id);
    setForm({
      name: cfg.name, first_response_minutes: cfg.first_response_minutes,
      resolution_minutes: cfg.resolution_minutes, priority: cfg.priority, is_default: cfg.is_default,
    });
    setShowDialog(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setShowDialog(true);
  };

  return {
    configs, isLoading, form, setForm, showDialog, setShowDialog, editingId,
    saveMutation, toggleMutation, deleteMutation, openEdit, openCreate,
  };
}
