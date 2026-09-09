import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';

export interface TalkXTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  tags: string[];
  status: 'draft' | 'review' | 'approved';
  use_count: number;
  created_by: string | null;
  custom_variables: string[];
  created_at: string;
  updated_at: string;
  creator?: { name: string | null } | null;
}

export type TemplateInput = Pick<TalkXTemplate, 'name' | 'content'> & Partial<Pick<TalkXTemplate, 'description' | 'category' | 'media_url' | 'media_type' | 'tags' | 'status' | 'custom_variables'>>;
type TemplateUpdateInput = TemplateInput & { id: string; expectedUpdatedAt: string };

export function useTalkXTemplates() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ['talkx-templates'],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_templates')
        .select('*, creator:created_by(name)')
        .order('use_count', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXTemplate[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['talkx-templates'] });

  const createTemplate = useMutation({
    mutationFn: async (input: TemplateInput) => {
      const { data, error } = await fromTable('talkx_templates')
        .insert({ ...input, created_by: profile?.id ?? null })
        .select().single();
      if (error) throw error;
      return data as TalkXTemplate;
    },
    onSuccess: () => { invalidate(); toast.success('Template salvo'); },
    onError: (e: Error) => toast.error(`Erro ao salvar template: ${e.message}`),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, ...updates }: TemplateUpdateInput) => {
      const current = query.data?.find((template) => template.id === id);
      if (!current) throw new Error('Template desatualizado; recarregue e tente novamente');
      const next = { ...current, ...updates };
      const { data, error } = await supabase.rpc('update_talkx_template_with_snapshot', {
        p_template_id: id,
        p_expected_updated_at: expectedUpdatedAt,
        p_name: next.name,
        p_description: next.description,
        p_category: next.category,
        p_content: next.content,
        p_media_url: next.media_url,
        p_media_type: next.media_type,
        p_tags: next.tags,
        p_status: next.status,
        p_custom_variables: next.custom_variables ?? [],
      });
      if (error) throw error;
      const persisted = data?.[0];
      if (!persisted) throw new Error('Atualização não confirmada pelo banco');
      return { ...next, updated_at: persisted.updated_at };
    },
    onSuccess: (updated) => {
      qc.setQueryData<TalkXTemplate[]>(['talkx-templates'], (templates) =>
        templates?.map((template) => template.id === updated.id ? updated : template)
      );
      invalidate();
      toast.success('Template atualizado');
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar: ${e.message}`),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable('talkx_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Template excluído'); },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const duplicateTemplate = useMutation({
    mutationFn: async (t: TalkXTemplate) => {
      const { error } = await fromTable('talkx_templates').insert({
        name: `${t.name} (cópia)`, description: t.description, category: t.category, content: t.content,
        media_url: t.media_url, media_type: t.media_type, tags: t.tags, status: 'draft', created_by: profile?.id ?? null, custom_variables: t.custom_variables ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Template duplicado'); },
    onError: (e: Error) => toast.error(`Erro ao duplicar: ${e.message}`),
  });

  /** Incrementa o contador de uso quando um template vira campanha (best-effort). */
  const registerUse = async (id: string, _current: number) => {
    await supabase.rpc('increment_talkx_template_use', { p_template_id: id });
    invalidate();
  };



  const fetchVersionHistory = async (templateId: string) => {
    const { data } = await supabase
      .from('talkx_template_versions')
      .select('id,version_number,name,description,content,category,status,media_url,media_type,tags,custom_variables,created_at')
      .eq('template_id', templateId)
      .order('version_number', { ascending: false })
      .limit(10);
    return data ?? [];
  };

  const testTemplate = async ({ templateContent, mediaUrl, mediaType, phone, customVariables }: {
    templateContent: string; mediaUrl?: string | null; mediaType?: string | null; phone: string; customVariables?: string[];
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/talkx-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'test', templateContent, mediaUrl, mediaType, phone, customVariables }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `Erro ${res.status}`);
    return json;
  };

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, registerUse,
    testTemplate,
    fetchVersionHistory,
  };
}
