import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/ui/use-toast';
import type { AIProvider, ProviderFormData } from './types';
import { EMPTY_FORM } from './types';

/**
 * IA-040 — contrato do modo teste do ai-proxy (`test: true`).
 * A resposta traz SEMPRE este corpo, de sucesso ou de falha:
 * { ok, code, provider_id, provider_name, model_used, latency_ms, detail }.
 * O cliente lê apenas estes campos — nada é inventado aqui.
 */
interface ProviderTestResponse {
  ok?: boolean;
  code?: string;
  provider_id?: string;
  provider_name?: string;
  model_used?: string;
  latency_ms?: number;
  detail?: string;
}

/** Rótulos (pt-BR) dos códigos classificados pelo ai-proxy no modo teste. */
const TEST_CODE_LABELS: Record<string, string> = {
  MISSING_KEY: 'Chave/endpoint ausente',
  QUOTA: 'Quota esgotada',
  CONTRACT: 'Contrato ou resposta inválida',
  NETWORK: 'Falha de rede',
  ROUTING: 'Falha de roteamento',
  CAPABILITY: 'Capacidade não declarada',
};

/**
 * Em resposta não-2xx o `functions.invoke` devolve `error` e o corpo fica em
 * `error.context` (Response). Sem ler esse corpo o painel não teria o `code`
 * nem o `provider_name` de quem respondeu.
 */
async function readInvokeErrorBody(error: unknown): Promise<ProviderTestResponse | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const parsed: unknown = await context.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ProviderTestResponse;
    }
  } catch {
    // Corpo não-JSON (ex.: "Internal server error"): segue sem detalhe do provedor.
  }
  return null;
}

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
          // IA-040: sem `test: true` o proxy responderia pelo fluxo normal (com
          // fallback) e um provedor quebrado apareceria como sucesso — o teste mentiria.
          test: true,
          provider_id: provider.id,
          messages: [
            { role: 'system', content: 'Responda apenas: TESTE OK' },
            { role: 'user', content: 'Olá, teste de conexão.' },
          ],
          use_for: provider.use_for[0] || 'copilot',
        },
      });

      // O sucesso é decidido pelo CORPO (`ok`), nunca só pelo status HTTP: no
      // modo teste o ai-proxy responde com este corpo mesmo em 4xx/5xx, e o
      // `error` do invoke carrega o mesmo corpo em `error.context`.
      const body = (data && typeof data === 'object' && !Array.isArray(data))
        ? (data as ProviderTestResponse)
        : await readInvokeErrorBody(error);

      if (!body) {
        const msg = error instanceof Error ? error.message : 'Sem corpo de resposta do ai-proxy.';
        throw new Error(msg);
      }

      if (body.ok !== true) {
        // O provedor TESTADO falhou: mostramos o `code` classificado e o
        // `provider_name` de quem respondeu — nunca um "sucesso" do original.
        const code = body.code || 'CONTRACT';
        const quem = body.provider_name || provider.name;
        const rotulo = TEST_CODE_LABELS[code] || code;
        toast({
          title: `❌ Falha no teste — ${quem} (${code})`,
          description: `${rotulo}${body.detail ? `: ${body.detail}` : ''} — o provedor testado não respondeu com sucesso.`.slice(0, 300),
          variant: 'destructive',
        });
        return;
      }

      const quem = body.provider_name || provider.name;
      const info = [
        body.model_used,
        typeof body.latency_ms === 'number' ? `${body.latency_ms} ms` : null,
      ].filter(Boolean).join(' · ');
      toast({
        title: `✅ Teste OK — ${quem}`,
        description: `${[info, body.detail].filter(Boolean).join(' · ')}`.slice(0, 300) || 'Provedor respondeu com sucesso.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: `❌ Falha no Teste — ${provider.name}`, description: msg, variant: 'destructive' });
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
