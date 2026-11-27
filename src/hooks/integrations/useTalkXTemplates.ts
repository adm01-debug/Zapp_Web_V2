import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { fetchConversionRanking, type TalkXTemplateConversionState } from './useTalkXTemplatesConversion';

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
  /**
   * V26 — versão (talkx_template_versions.id) correspondente ao conteúdo VIVO
   * do template. Ponteiro mantido por update_talkx_template_with_snapshot; a
   * listagem já traz a coluna via `select('*')`. Nulo quando o template ainda
   * não tem versão corrente (ex.: criado antes do backfill e nunca editado).
   */
  current_version_id?: string | null;
  /** Arquivamento (N-127): sai da lista ativa sem apagar histórico/variantes. */
  archived_at?: string | null;
  creator?: { name: string | null } | null;
}

export type TemplateInput = Pick<TalkXTemplate, 'name' | 'content'> & Partial<Pick<TalkXTemplate, 'description' | 'category' | 'media_url' | 'media_type' | 'tags' | 'status' | 'custom_variables'>>;
type TemplateUpdateInput = TemplateInput & { id: string; expectedUpdatedAt: string };
type GeneratedSnapshotArgs = Database['public']['Functions']['update_talkx_template_with_snapshot']['Args'];
type SnapshotArgs = Omit<GeneratedSnapshotArgs, 'p_description' | 'p_media_url' | 'p_media_type'> & {
  p_description: string | null;
  p_media_url: string | null;
  p_media_type: string | null;
};

/** Texto do erro sem assumir a forma (Error, PostgrestError ou desconhecido). */
/**
 * RPC do Talk X que responde `{ ok, error? }` em jsonb (N-127): o erro de negócio
 * vem DENTRO do jsonb, não como `error` do PostgREST. Sem desembrulhar, a tela
 * diria "duplicado" mesmo quando o banco recusou.
 */
function unwrapTalkXRpc(data: unknown): Record<string, unknown> {
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'talkx_rpc_failed');
  }
  return payload;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

function templateUpdateErrorMessage(error: unknown): string {
  const message = errorText(error);
  if (message.includes('talkx_template_stale_version')) {
    return 'Este template foi alterado por outra pessoa. Recarregue a lista antes de salvar novamente.';
  }
  if (message.includes('talkx_template_not_authorized')) {
    return 'Você não tem permissão para alterar este template.';
  }
  if (message.includes('invalid_talkx_template')) {
    return 'O template contém dados inválidos. Revise os campos e tente novamente.';
  }
  return 'Não foi possível atualizar o template. Tente novamente.';
}

function templateDeleteErrorMessage(error: unknown): string {
  const message = errorText(error);
  // N-127: o trigger BEFORE DELETE e a RPC recusam apagar template vinculado a
  // campanha — sem traduzir, o usuario veria so o codigo cru do banco.
  if (message.includes('talkx_template_in_use')) {
    return 'Este template está em uso por uma campanha. Desvincule ou exclua a campanha antes de apagar o template.';
  }
  return `Erro ao excluir: ${message}`;
}

export type TemplateVariant = {
  id: string; template_id: string; label: 'A' | 'B' | 'C';
  content: string; media_url: string | null; media_type: string | null;
  weight: number; created_at: string;
};

export function useTalkXTemplates() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ['talkx-templates'],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_templates')
        // `*` já inclui current_version_id (o ponteiro do conteúdo VIVO, V26),
        // consumido pelo editor de campanha para gravar template_version_id.
        .select('*, creator:created_by(name)')
        .order('use_count', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXTemplate[];
    },
  });

  // X092/T04-039 — "Mais convertidos": ranking por taxa de resposta (base mínima A9).
  // Mesma chave de cache para todos os consumidores do hook: uma leitura por sessão.
  const conversionQuery = useQuery({
    queryKey: ['talkx-template-conversion-ranking'],
    queryFn: fetchConversionRanking,
  });
  const conversion: TalkXTemplateConversionState = {
    ranking: conversionQuery.data ?? null,
    isLoading: conversionQuery.isLoading,
    isError: conversionQuery.isError,
    error: conversionQuery.error as Error | null,
  };

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
      const snapshotArgs = {
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
      } satisfies SnapshotArgs;
      // PostgreSQL aceita NULL nesses parametros text (a funcao nao e STRICT),
      // mas o typegen nao representa nulabilidade de argumentos sem default.
      const { data, error } = await supabase.rpc(
        'update_talkx_template_with_snapshot',
        snapshotArgs as unknown as GeneratedSnapshotArgs,
      );
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
    onError: (error: unknown) => toast.error(templateUpdateErrorMessage(error)),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      // N-127: a exclusão passa pela RPC (trava FOR UPDATE + guarda de campanha). O
      // DELETE direto na tabela batia no trigger `talkx_template_in_use` sem tradução.
      const { data, error } = await supabase.rpc('delete_talkx_template', { p_template_id: id });
      if (error) throw error;
      unwrapTalkXRpc(data);
    },
    onSuccess: () => { invalidate(); toast.success('Template excluído'); },
    onError: (e: Error) => toast.error(templateDeleteErrorMessage(e)),
  });

  const archiveTemplate = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data, error } = await supabase.rpc('archive_talkx_template', { p_template_id: id, p_archived: archived });
      if (error) throw error;
      unwrapTalkXRpc(data);
    },
    onSuccess: (_payload, { archived }) => {
      invalidate();
      toast.success(archived ? 'Template arquivado' : 'Template desarquivado');
    },
    onError: (e: Error) => toast.error(`Erro ao arquivar: ${errorText(e)}`),
  });

  const duplicateTemplate = useMutation({
    mutationFn: async (t: TalkXTemplate) => {
      // N-127: a RPC copia content/variáveis E as variantes A/B na mesma transação.
      // O INSERT daqui copiava só a linha e deixava as variantes para trás.
      const { data, error } = await supabase.rpc('duplicate_talkx_template', { p_template_id: t.id });
      if (error) throw error;
      const payload = unwrapTalkXRpc(data);
      const copyId = typeof payload.template_id === 'string' ? payload.template_id : null;
      if (!copyId) return null;
      const { data: row } = await fromTable('talkx_templates').select('*, creator:created_by(name)').eq('id', copyId).maybeSingle();
      return (row as TalkXTemplate | null) ?? null;
    },
    onSuccess: () => { invalidate(); toast.success('Template duplicado'); },
    onError: (e: Error) => toast.error(`Erro ao duplicar: ${errorText(e)}`),
  });

  /** Incrementa o contador de uso quando um template vira campanha (best-effort). */
  // V15: removido — o trigger E86 (trg_talkx_increment_template_use_count) já conta
  // o uso exatamente 1 vez ao lançar a campanha; a RPC no front causava dobro (P2-4).



  const fetchVersionHistory = async (templateId: string) => {
    const { data } = await supabase
      .from('talkx_template_versions')
      .select('id,template_id,version_number,name,description,content,category,status,media_url,media_type,tags,custom_variables,created_at')
      .eq('template_id', templateId)
      .order('version_number', { ascending: false })
      .limit(10);
    return data ?? [];
  };

  const testTemplate = async ({ templateContent, mediaUrl, mediaType, phone, connectionId, customVariables }: {
    templateContent: string; mediaUrl?: string | null; mediaType?: string | null; phone: string; connectionId: string; customVariables?: string[];
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    // SEC-FE-01: a URL vem de @/config/supabase (a mesma fonte do client.ts). NÃO usar
    // VITE_SUPABASE_URL: a hospedagem a injeta apontando para outro projeto, e o JWT da
    // sessão não pode sair para outra origem.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/talkx-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'test', templateContent, mediaUrl, mediaType, phone, connectionId, customVariables }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `Erro ${res.status}`);
    return json;
  };


  // E49: busca variantes A/B de um template
  const fetchVariants = async (templateId: string): Promise<TemplateVariant[]> => {
    const { data, error: varErr } = await supabase
      .from('talkx_template_variants')
      .select('id,template_id,label,content,media_url,media_type,weight,created_at')
      .eq('template_id', templateId).order('label', { ascending: true });
    if (varErr) throw new Error(`Erro ao buscar variantes: ${varErr.message}`);
    return (data ?? []) as TemplateVariant[];
  };

  const saveVariant = async (templateId: string, variant: Omit<TemplateVariant, 'id' | 'created_at'> & { id?: string }) => {
    const { id, ...payload } = variant;
    if (id) {
      const { error } = await supabase.from('talkx_template_variants').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('talkx_template_variants').insert({ ...payload, template_id: templateId });
      if (error) throw error;
    }
    invalidate();
  };

  const deleteVariant = async (variantId: string) => {
    const { error } = await supabase.from('talkx_template_variants').delete().eq('id', variantId);
    if (error) throw error;
    invalidate();
  };

  const countVariantRecipients = async (variantId: string): Promise<number> => {
    const { count } = await supabase
      .from('talkx_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('variant_id', variantId);
    return count ?? 0;
  };

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, archiveTemplate,
    testTemplate,
    conversion,
    fetchVersionHistory,
    fetchVariants, saveVariant, deleteVariant, countVariantRecipients,
  };
}
