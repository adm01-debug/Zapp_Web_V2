import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MultiplixEligibility } from '@/lib/multiplix-eligibility';

async function invokeMultiplixAudience<T>(action: string, params?: object): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-audience', {
    body: { action, params },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw await toMultiplixError(response.error);
  return (response.data as { data: T }).data;
}

// F17: acima do teto de destinatarios a edge responde 400 com
// { error: 'multiplix_over_recipient_limit', count, limit } — o composer usa o
// numero real para pedir a confirmacao explicita do operador.
export class MultiplixOverLimitError extends Error {
  readonly count: number;
  readonly limit: number | null;

  constructor(count: number, limit: number | null, message?: string) {
    super(message ?? `Disparo acima do teto de destinatarios (${count}${limit ? `/${limit}` : ''})`);
    this.name = 'MultiplixOverLimitError';
    this.count = count;
    this.limit = limit;
  }
}

// O corpo da resposta de erro fica em error.context (Response) — sem ler isso o
// usuario so veria "Edge Function returned a non-2xx status code".
async function toMultiplixError(error: unknown): Promise<Error> {
  const fallback = (error as { message?: string })?.message ?? 'Falha ao chamar multiplix-audience';
  const context = (error as { context?: Response })?.context;
  if (!context || typeof context.clone !== 'function') return new Error(fallback);
  try {
    const body = await context.clone().json() as { error?: string; count?: number; limit?: number; message?: string };
    if (body?.error === 'multiplix_over_recipient_limit') {
      return new MultiplixOverLimitError(body.count ?? 0, body.limit ?? null, body.message);
    }
    if (body?.error) return new Error(body.error);
  } catch {
    // corpo sem JSON (timeout/proxy): fica a mensagem padrao
  }
  return new Error(fallback);
}

export interface MultiplixRamo { ramo_atividade: string; total: number }
export interface MultiplixUf { uf: string; total: number }

export interface MultiplixAudienceRow {
  company_id: string;
  company_name: string;
  ramo_atividade: string;
  uf: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_carrier: boolean;
  destino_e164: string | null;
  destino_origem: string;
  motivo_inclusao: string;
}

export interface MultiplixSearchFilters {
  roles?: Array<'cliente' | 'fornecedor' | 'transportadora'>;
  ramo?: string;
  uf?: string;
  search?: string;
}

export function useMultiplixRamos() {
  return useQuery<MultiplixRamo[], Error>({
    queryKey: ['multiplix-ramos'],
    queryFn: () => invokeMultiplixAudience('list_ramos'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMultiplixUfs() {
  return useQuery<MultiplixUf[], Error>({
    queryKey: ['multiplix-ufs'],
    queryFn: () => invokeMultiplixAudience('list_ufs'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMultiplixSearch() {
  return useMutation({
    mutationFn: (filters: MultiplixSearchFilters & { page?: number; page_size?: number }) =>
      invokeMultiplixAudience<MultiplixAudienceRow[]>('search', filters),
  });
}

export function useMultiplixCount() {
  return useMutation({
    mutationFn: (filters: MultiplixSearchFilters) =>
      invokeMultiplixAudience<number>('count', filters),
  });
}

export interface MultiplixResolvedRecipient {
  company_id: string;
  contact_id: string | null;
  company_name: string | null;
  destino_e164: string | null;
  destino_origem: string | null;
  // Enum canonico do banco (ingles), o MESMO do mapa unico em
  // `_shared/multiplix-eligibility.ts` — a edge traduz o PT do Singu na fronteira
  // antes de responder, entao o front nunca compara com 'apto'/'fora_do_escopo'.
  elegibilidade: MultiplixEligibility;
}

export function useMultiplixResolve() {
  return useMutation({
    mutationFn: (companyIds: string[]) =>
      invokeMultiplixAudience<MultiplixResolvedRecipient[]>('resolve', { company_ids: companyIds }),
  });
}

// F08: criacao do disparo no servidor (a RPC transacional multiplix_create_draft
// e chamada pela edge, com o publico re-resolvido no Singu sob o escopo do JWT).
export interface MultiplixDraftInput {
  name: string;
  message_template: string;
  company_ids: string[];
  contact_ids?: string[];
  client_request_id: string;
  scheduled_at?: string | null;
  confirm_over_limit?: boolean;
}

export interface MultiplixDraftResult {
  dispatch_id: string | null;
  recipient_count: number;
  created: boolean;
}

export function createMultiplixDraft(input: MultiplixDraftInput) {
  return invokeMultiplixAudience<MultiplixDraftResult>('create_draft', input);
}
