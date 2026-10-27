/**
 * Presets de filtro do Inbox, sincronizados entre dispositivos.
 *
 * Fonte da verdade: a tabela `saved_filters` (entity_type = 'inbox_filters'),
 * escopada por `user_id` via RLS. NÃO há localStorage como fonte de verdade —
 * era o defeito do V3 que ressuscitava preset apagado em outro dispositivo.
 *
 * O que um preset guarda: o chip de status (Todas, Não lidas, Em atendimento,
 * Aguardando, Resolvidas, Arquivadas), o tipo de contato e a fila. A BUSCA é
 * deliberadamente excluída: o texto digitado pode conter dado pessoal e não
 * sobe para o servidor.
 *
 * Chave de cache ['saved-filters', 'inbox_filters'] — a MESMA que
 * `useSavedFilters` usa para o mesmo entity_type, então as duas camadas
 * enxergam e invalidam o mesmo cache.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ChipTab } from '@/components/inbox/TicketTabs';

export const INBOX_FILTER_PRESET_ENTITY = 'inbox_filters';
/** Teto por usuário, o mesmo do gatilho no banco (migration 20261026190300). */
export const MAX_INBOX_FILTER_PRESETS = 20;
export const PRESET_NAME_MAX_LENGTH = 40;

export const INBOX_FILTER_PRESETS_QUERY_KEY = [
  'saved-filters',
  INBOX_FILTER_PRESET_ENTITY,
] as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/;

/** Marcador do id otimista, antes de o servidor devolver o id real. */
const PENDING_PRESET_PREFIX = 'pending_';

/**
 * Chips de status que o Inbox conhece (`ChipTab`). O `Record` obriga o
 * compilador a acusar esta lista se um chip novo nascer em `StatusChips`.
 */
const CHIP_TABS_VALIDOS: Record<ChipTab, true> = {
  all: true,
  unread: true,
  attending: true,
  waiting: true,
  resolved: true,
  archived: true,
};

const CHIP_PADRAO: ChipTab = 'all';

function isChipTab(value: unknown): value is ChipTab {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHIP_TABS_VALIDOS, value);
}

/** Conteúdo do preset — SEM `search`: busca digitada não vai ao servidor. */
export interface InboxFilterPresetContent {
  chipTab: ChipTab;
  contactType: string | null;
  queueId: string | null;
}

export interface InboxFilterPreset {
  id: string;
  name: string;
  filters: InboxFilterPresetContent;
  created_at: string;
  user_id: string;
}

export interface SaveInboxPresetInput {
  /** Ausente = cria; presente = atualiza a linha daquele id (upsert por id). */
  id?: string;
  name: string;
  filters: InboxFilterPresetContent;
}

export interface PresetNameValidation {
  ok: boolean;
  /** Nome já normalizado (trim) quando válido. */
  value: string;
  error: string | null;
}

/**
 * Valida o nome antes de gravar: vazio, tamanho (1–40), caracteres de controle
 * e duplicidade case-insensitive contra a lista atual. `ignoreId` permite
 * revalidar o próprio preset ao editar.
 *
 * A duplicidade é comparada como TEXTO (`toLowerCase`), nunca com `.ilike`:
 * `%` e `_` viram curinga no ilike e fariam "Promo 50%" casar com "Promo 50x".
 */
export function validateInboxPresetName(
  name: string,
  presets: InboxFilterPreset[] = [],
  ignoreId?: string
): PresetNameValidation {
  const value = (name ?? '').trim();
  if (value.length === 0) {
    return { ok: false, value: '', error: 'Informe um nome para o filtro.' };
  }
  if (value.length > PRESET_NAME_MAX_LENGTH) {
    return {
      ok: false,
      value,
      error: `O nome deve ter no máximo ${PRESET_NAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (CONTROL_CHARS.test(value)) {
    return { ok: false, value, error: 'O nome contém caracteres inválidos.' };
  }
  const duplicated = presets.some(
    (p) => p.id !== ignoreId && (p.name ?? '').trim().toLowerCase() === value.toLowerCase()
  );
  if (duplicated) {
    return { ok: false, value, error: 'Já existe um filtro com esse nome.' };
  }
  return { ok: true, value, error: null };
}

/** Compara só o conteúdo do preset (chip/tipo/fila), sem nome nem id. */
export function sameInboxPresetContent(
  a: InboxFilterPresetContent,
  b: InboxFilterPresetContent
): boolean {
  return (
    a.chipTab === b.chipTab &&
    (a.contactType ?? null) === (b.contactType ?? null) &&
    (a.queueId ?? null) === (b.queueId ?? null)
  );
}

interface SavedFilterRow {
  id: string;
  name: string;
  filters: unknown;
  created_at: string | null;
  user_id: string;
}

/**
 * Lê o chip de uma linha. Aceita também a forma antiga (`mainTab`/`subTab`)
 * que a primeira versão do preset gravava, para nenhum preset salvo ficar
 * ilegível; valor desconhecido cai no chip padrão.
 */
function chipFromStored(f: Record<string, unknown>): ChipTab {
  if (isChipTab(f.chipTab)) return f.chipTab;
  if (f.mainTab === 'resolved') return 'resolved';
  if (f.subTab === 'attending' || f.subTab === 'waiting') return f.subTab;
  return CHIP_PADRAO;
}

function fromRow(row: SavedFilterRow): InboxFilterPreset {
  const f = (row.filters && typeof row.filters === 'object' && !Array.isArray(row.filters)
    ? row.filters
    : {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at ?? new Date().toISOString(),
    user_id: row.user_id,
    filters: {
      chipTab: chipFromStored(f),
      contactType: typeof f.contactType === 'string' ? f.contactType : null,
      queueId: typeof f.queueId === 'string' ? f.queueId : null,
    },
  };
}

/** Campos que vão para a coluna `filters` (jsonb) — sem `search`. */
function toPayload(filters: InboxFilterPresetContent) {
  return {
    chipTab: filters.chipTab,
    contactType: filters.contactType ?? null,
    queueId: filters.queueId ?? null,
  };
}

export function useInboxFilterPresets() {
  const queryClient = useQueryClient();
  const queryKey = INBOX_FILTER_PRESETS_QUERY_KEY;

  const { data: presets = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('saved_filters')
        .select('id, name, filters, created_at, user_id')
        .eq('entity_type', INBOX_FILTER_PRESET_ENTITY)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        // Desempate determinístico: sem ele, dois presets criados no mesmo
        // milissegundo podem trocar de lugar entre leituras.
        .order('id', { ascending: true })
        .limit(MAX_INBOX_FILTER_PRESETS);

      if (error) throw error;
      return ((data ?? []) as SavedFilterRow[]).map(fromRow);
    },
  });

  // EC-3: o cache de presets é do usuário que saiu. O AuthProvider já limpa o
  // QueryClient inteiro no SIGNED_OUT; esta assinatura garante a mesma higiene
  // quando o hook é montado sem o provider (teste, Storybook) e torna a regra
  // verificável no próprio arquivo.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, queryKey]);

  // Salvar/atualizar por id. Erro de gravação REVERTE o estado local (volta o
  // snapshot otimista) e avisa — nada de 'dispara e esquece' com a lista
  // divergente do servidor.
  const saveMutation = useMutation({
    mutationFn: async (input: SaveInboxPresetInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const current = (queryClient.getQueryData<InboxFilterPreset[]>(queryKey) ?? []).filter(
        // `onMutate` roda ANTES do `mutationFn` (React Query v5) e já pôs o
        // otimista no cache — ele não pode contar como duplicata de si mesmo.
        (p) => !p.id.startsWith(PENDING_PRESET_PREFIX)
      );
      const validation = validateInboxPresetName(input.name, current, input.id);
      if (!validation.ok) throw new Error(validation.error ?? 'Nome inválido.');
      if (!input.id && current.length >= MAX_INBOX_FILTER_PRESETS) {
        throw new Error(
          `Limite de ${MAX_INBOX_FILTER_PRESETS} filtros salvos do inbox por usuário atingido.`
        );
      }

      const row = {
        name: validation.value,
        filters: toPayload(input.filters),
      };

      if (input.id) {
        const { data, error } = await supabase
          .from('saved_filters')
          .update(row)
          .eq('id', input.id)
          .eq('user_id', user.id)
          .eq('entity_type', INBOX_FILTER_PRESET_ENTITY)
          .select('id, name, filters, created_at, user_id')
          .single();
        if (error) throw error;
        return fromRow(data as SavedFilterRow);
      }

      const { data, error } = await supabase
        .from('saved_filters')
        .insert({
          user_id: user.id,
          entity_type: INBOX_FILTER_PRESET_ENTITY,
          ...row,
        })
        .select('id, name, filters, created_at, user_id')
        .single();
      if (error) throw error;
      return fromRow(data as SavedFilterRow);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InboxFilterPreset[]>(queryKey);
      const optimistic: InboxFilterPreset = {
        id: input.id ?? `${PENDING_PRESET_PREFIX}${Date.now()}`,
        name: input.name,
        filters: input.filters,
        created_at: new Date().toISOString(),
        user_id: '',
      };
      queryClient.setQueryData<InboxFilterPreset[]>(queryKey, (old = []) => [
        optimistic,
        ...old.filter((p) => p.id !== optimistic.id),
      ]);
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(`Erro ao salvar filtro do inbox: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Filtro do inbox salvo!');
    },
    onSettled: () => {
      // O servidor é a fonte da verdade: relê para o otimista nunca vencer.
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Excluir. Erro REVERTE a remoção otimista e avisa. Como a lista vem sempre
  // do servidor (invalidate → refetch), o preset apagado não ressuscita.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('entity_type', INBOX_FILTER_PRESET_ENTITY);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InboxFilterPreset[]>(queryKey);
      queryClient.setQueryData<InboxFilterPreset[]>(queryKey, (old = []) =>
        old.filter((p) => p.id !== id)
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(`Erro ao remover filtro do inbox: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Filtro do inbox removido');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    presets,
    isLoading,
    savePreset: saveMutation.mutateAsync,
    deletePreset: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export default useInboxFilterPresets;
