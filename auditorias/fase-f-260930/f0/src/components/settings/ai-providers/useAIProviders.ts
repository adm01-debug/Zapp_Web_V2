import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/ui/use-toast';
import type { AIProvider, ProviderFormData } from './types';
import { EMPTY_FORM } from './types';

export function useAIProviders() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormData>(EMPTY_FORM);
  const [testing, setTesting] = useState<string | null>(null);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AIProvider[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ProviderFormData) => {
      const record = {
        name: payload.name,
        description: payload.description || null,
        provider_type: payload.provider_type,
        api_endpoint: payload.api_endpoint || null,
        api_key_secret_name: payload.api_key_secret_name || null,
        model: payload.model || null,
        system_prompt: payload.system_prompt || null,
        config: (payload.config || {}) as unknown as Json,
        is_active: payload.is_active,
        is_default: payload.is_default,
        use_for: payload.use_for,
      };

      if (editingId) {
        const { error } = await supabase.from('ai_providers').update(record).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_providers').insert(record as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast({ title: editingId ? 'Provedor atualizado!' : 'Provedor criado!' });
      closeDialog();
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_providers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast({ title: 'Provedor removido.' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleTest = async (provider: AIProvider) => {
    setTesting(provider.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            { role: 'system', content: 'Responda apenas: TESTE OK' },
            { role: 'user', content: 'Olá, teste de conexão.' },
          ],
          use_for: provider.use_for[0] || 'copilot',
          provider_id: provider.id,
        },
      });
      if (error) throw error;
      const content = data?.choices?.[0]?.message?.content || JSON.stringify(data);
      toast({ title: '✅ Teste OK!', description: content.slice(0, 200) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: '❌ Falha no Teste', description: msg, variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const openEdit = (p: AIProvider) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      provider_type: p.provider_type,
      api_endpoint: p.api_endpoint,
      api_key_secret_name: p.api_key_secret_name,
      model: p.model,
      system_prompt: p.system_prompt,
      config: p.config || {},
      is_active: p.is_active,
      is_default: p.is_default,
      use_for: p.use_for,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const toggleUseFor = (val: string) => {
    setForm(prev => ({
      ...prev,
      use_for: prev.use_for.includes(val)
        ? prev.use_for.filter(v => v !== val)
        : [...prev.use_for, val],
    }));
  };

  return {
    providers,
    isLoading,
    dialogOpen,
    setDialogOpen,
    editingId,
    form,
    setForm,
    testing,
    saveMutation,
    deleteMutation,
    handleTest,
    openEdit,
    openNew,
    closeDialog,
    toggleUseFor,
  };
}
