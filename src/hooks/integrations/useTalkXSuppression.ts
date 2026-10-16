import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

export type BlacklistReasonCode =
  | 'opt_out'
  | 'invalid_number'
  | 'manual'
  | 'lgpd'
  | 'no_commercial_permission'
  | 'bounce';

export type BlacklistEntry = {
  id: string;
  contact_id: string | null;
  phone: string | null;
  reason: string | null;
  reason_code: BlacklistReasonCode | null;
  origin: string;
  campaign_id: string | null;
  blocked_by: string | null;
  expires_at: string | null;
  source_message_id: string | null;
  created_at: string;
};

export type BlacklistInput = {
  contact_id?: string | null;
  phone?: string | null;
  reason?: string;
  reason_code?: BlacklistReasonCode;
  campaign_id?: string | null;
  expires_at?: string | null;
  source_message_id?: string | null;
};

export function useTalkXSuppression() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['talkx-suppression'] });

  const query = useQuery({
    queryKey: ['talkx-suppression'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('id,contact_id,phone,reason,reason_code,origin,campaign_id,blocked_by,expires_at,source_message_id,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BlacklistEntry[];
    },
  });

  /** Verifica se um número de telefone está na lista de supressão (incluindo expiração). */
  const isSuppressed = async (phone: string): Promise<boolean> => {
    const clean = phone.replace(/\D/g, '');
    const now = new Date().toISOString();
    const { data: byPhone } = await supabase.from('talkx_blacklist')
      .select('id').eq('phone', clean)
      .or('expires_at.is.null,expires_at.gt.' + now).limit(1);
    if (byPhone && byPhone.length > 0) return true;
    const { data: contact } = await supabase.from('contacts').select('id').eq('phone', clean).maybeSingle();
    if (!contact) return false;
    const { data: byContact } = await supabase.from('talkx_blacklist')
      .select('id').eq('contact_id', contact.id)
      .or('expires_at.is.null,expires_at.gt.' + now).limit(1);
    return !!(byContact && byContact.length > 0);
  };

  const addEntry = useMutation({
    mutationFn: async (input: BlacklistInput) => {
      if (!input.phone && !input.contact_id) throw new Error('phone ou contact_id obrigatório');
      if (input.phone) input = { ...input, phone: input.phone.replace(/\D/g, '') };
      if (!input.phone && !input.contact_id) throw new Error('phone invalido apos normalizacao');
      const { error } = await supabase.from('talkx_blacklist').insert({
        phone: input.phone ?? null,
        contact_id: input.contact_id ?? null,
        reason: input.reason ?? null,
        reason_code: input.reason_code ?? 'manual',
        origin: 'manual',
        campaign_id: input.campaign_id ?? null,
        expires_at: input.expires_at ?? null,
        source_message_id: input.source_message_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Número adicionado à supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Entrada removida'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isSuppressed,
    addEntry,
    removeEntry,
  };
}

/* -------------------------------------------------------------------------- */
/* X184 — Atividade recente da lista, lida dos eventos de ENTIDADE             */
/* -------------------------------------------------------------------------- */

/**
 * Tipos que a trilha de supressão usa em `talkx_campaign_events`: os três de
 * linha (`suppression_add/remove/update`) estão no CHECK do banco desde a V11
 * (`M:20260929730000:33-37`); os dois de lote (`import`/`export`) entram com a
 * importação e a exportação da lista (V74/V75).
 *
 * O leitor filtra por ESTE vocabulário e não por `entity_type` — que a F06
 * ("Trilha de supressão", V71–V80) ainda formaliza. O evento de entidade
 * (`entity_type` `suppression`/`suppression_batch`) é o caso comum, mas o mesmo
 * `event_type` também pode estar gravado junto de uma campanha, e essa
 * atividade é da lista do mesmo jeito; o que o usuário não pode ver, o RLS barra.
 */
export const SUPPRESSION_ACTIVITY_EVENT_TYPES = [
  'suppression_add',
  'suppression_remove',
  'suppression_update',
  'suppression_import',
  'suppression_export',
] as const;

export type SuppressionActivityEventType = (typeof SUPPRESSION_ACTIVITY_EVENT_TYPES)[number];

/** Ação da trilha: o que a tela agrupa em ícone + título. */
export type SuppressionActivityAction = 'add' | 'remove' | 'update' | 'import' | 'export';

export interface SuppressionActivityItem {
  id: string;
  /** `null` quando o `event_type` gravado não está no contrato da tela. */
  action: SuppressionActivityAction | null;
  title: string;
  /** E-mail do contato; telefone quando não há e-mail. `null` = evento sem contato. */
  contactLabel: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SuppressionActivityPage {
  items: SuppressionActivityItem[];
  /** Contagem exata do servidor — não o tamanho da página. */
  total: number;
}

const ACTION_BY_EVENT_TYPE: Record<SuppressionActivityEventType, SuppressionActivityAction> = {
  suppression_add: 'add',
  suppression_remove: 'remove',
  suppression_update: 'update',
  suppression_import: 'import',
  suppression_export: 'export',
};

/** Ação de um `event_type` da trilha; `null` para tipo fora do contrato. */
export function suppressionActivityAction(eventType: string | null | undefined): SuppressionActivityAction | null {
  if (!eventType) return null;
  return (ACTION_BY_EVENT_TYPE as Record<string, SuppressionActivityAction>)[eventType] ?? null;
}

/**
 * Título do item no vocabulário da tela (X184). O evento de lote traz a
 * contagem na mensagem (V74/V75); sem número legível o título sai sem contagem,
 * em vez de inventar um valor.
 */
export function suppressionActivityTitle(eventType: string | null | undefined, message: string | null | undefined): string {
  switch (suppressionActivityAction(eventType)) {
    case 'add': return 'Contato adicionado à lista';
    case 'remove': return 'Contato removido da lista';
    case 'update': return 'Motivo atualizado';
    case 'export': return 'Lista exportada';
    case 'import': {
      const digits = (message ?? '').match(/\d+/)?.[0];
      if (!digits) return 'Contatos importados';
      const n = Number(digits);
      return n === 1 ? '1 contato importado' : `${n} contatos importados`;
    }
    default: return 'Atividade na lista de supressão';
  }
}

interface SuppressionActivityEventRow {
  id: string;
  event_type: string | null;
  message: string | null;
  entity_id: string | null;
  created_at: string;
  actor: { name: string | null } | null;
}

interface BlacklistEntryRow {
  id: string;
  contact_id: string | null;
  phone: string | null;
}

interface ContactLabelRow {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * Contato de cada evento pelo `entity_id` (id da linha de `talkx_blacklist`) —
 * a tabela de eventos não tem FK para o contato, então a resolução é em duas
 * consultas. Supressão de telefone avulso não tem contato: aí o rótulo é o
 * telefone da própria linha da lista.
 */
async function resolveActivityContactLabels(rows: SuppressionActivityEventRow[]): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>();
  const entityIds = Array.from(new Set(rows.map((r) => r.entity_id).filter((id): id is string => !!id)));
  if (entityIds.length === 0) return labels;

  const { data: entries, error: entryError } = await fromTable('talkx_blacklist')
    .select('id,contact_id,phone')
    .in('id', entityIds);
  if (entryError) throw entryError;
  const entryRows = (entries ?? []) as BlacklistEntryRow[];

  const contactIds = Array.from(new Set(entryRows.map((e) => e.contact_id).filter((id): id is string => !!id)));
  const contacts: ContactLabelRow[] = [];
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactError } = await fromTable('contacts')
      .select('id,email,phone')
      .in('id', contactIds);
    if (contactError) throw contactError;
    contacts.push(...((contactRows ?? []) as ContactLabelRow[]));
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  for (const entry of entryRows) {
    const contact = entry.contact_id ? contactById.get(entry.contact_id) : undefined;
    const email = contact?.email?.trim() ?? '';
    const digits = (contact?.phone ?? entry.phone ?? '').replace(/\D/g, '');
    labels.set(entry.id, email || (digits ? `+${digits}` : null));
  }
  return labels;
}

export interface FetchTalkXSuppressionActivityOptions {
  /** Itens por página (5 no rail, 20 no histórico). */
  limit?: number;
  /** Página 0-based; o servidor recebe a fatia (`range`), não o teto de linhas. */
  page?: number;
  /** Filtro por tipo; `all` = trilha inteira. */
  eventType?: SuppressionActivityEventType | 'all';
}

/** Leitura da trilha de supressão (eventos de entidade), mais recentes primeiro. */
export async function fetchTalkXSuppressionActivity({
  limit = 5, page = 0, eventType = 'all',
}: FetchTalkXSuppressionActivityOptions = {}): Promise<SuppressionActivityPage> {
  const from = page * limit;
  let query = fromTable('talkx_campaign_events')
    .select('id,event_type,message,created_at,entity_id,actor:actor_id(name)', { count: 'exact' })
    .in('event_type', SUPPRESSION_ACTIVITY_EVENT_TYPES);
  if (eventType !== 'all') query = query.eq('event_type', eventType);

  // A página é pedida como FATIA (`range`), depois da ordem determinística —
  // nunca um `.limit()` solto, que devolveria um subconjunto arbitrário.
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    // Desempate obrigatório: sem ele a fatia de uma página pode repetir item
    // entre chamadas quando dois eventos caem no mesmo instante.
    .order('id', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as SuppressionActivityEventRow[];
  const labels = await resolveActivityContactLabels(rows);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: suppressionActivityAction(row.event_type),
      title: suppressionActivityTitle(row.event_type, row.message),
      contactLabel: row.entity_id ? labels.get(row.entity_id) ?? null : null,
      actorName: row.actor?.name ?? null,
      createdAt: row.created_at,
    })),
    // Sem a contagem do servidor, o total é o que a página prova existir.
    total: typeof count === 'number' ? count : from + rows.length,
  };
}

/**
 * Trilha de supressão para a tela: os 5 últimos itens no rail e o histórico
 * paginado do modal. `enabled` evita a consulta do histórico com o modal fechado.
 */
export function useTalkXSuppressionActivity({
  limit = 5, page = 0, eventType = 'all', enabled = true,
}: FetchTalkXSuppressionActivityOptions & { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['talkx-suppression-activity', limit, page, eventType],
    queryFn: () => fetchTalkXSuppressionActivity({ limit, page, eventType }),
    enabled,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
