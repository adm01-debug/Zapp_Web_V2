import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createMultiplixDraft } from './useMultiplixAudience';

export interface MultiplixDispatch {
  id: string;
  name: string;
  message_template: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'completed_with_failures' | 'failed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  outcome_unknown_count: number;
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MultiplixRecipientRow {
  id: string;
  company_name_snapshot: string | null;
  destino_e164: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

// ---------------------------------------------------------------------------
// Leitura via edge `multiplix-dispatch`.
//
// O front NAO le mais `multiplix_dispatches`/`multiplix_recipients` direto pelo
// PostgREST: a lista, o disparo do monitor, os destinatarios e a contagem de
// `skipped` passam pela edge (JWT obrigatorio), que aplica o escopo do usuario
// no servidor.
// ---------------------------------------------------------------------------

/** Forma normalizada de uma lista devolvida pela edge. `total` e `null` quando
 * a acao nao devolve a contagem exata (o chamador decide o fallback). */
export interface MultiplixListPayload<T> {
  rows: T[];
  total: number | null;
}

/**
 * Erro nomeado devolvido pela edge `multiplix-dispatch`.
 *
 * Contrato de resposta da edge (supabase/functions/multiplix-dispatch/index.ts):
 * sucesso -> `{ data: ... }` (jsonResponse); falha de negocio ->
 * `{ error: <codigo|mensagem> }` (errorResponse / DispatchError). Sem ler o
 * corpo de `error.context` o usuario so veria "Edge Function returned a
 * non-2xx status code".
 */
export class MultiplixDispatchEdgeError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'MultiplixDispatchEdgeError';
    this.code = code;
  }
}

async function toMultiplixDispatchError(error: unknown): Promise<Error> {
  const fallback = (error as { message?: string })?.message ?? 'Falha ao chamar multiplix-dispatch';
  const context = (error as { context?: Response })?.context;
  if (!context || typeof context.clone !== 'function') return new Error(fallback);
  try {
    const body = await context.clone().json() as { error?: string; message?: string };
    const code = body?.error ?? body?.message;
    if (code) return new MultiplixDispatchEdgeError(code, body?.message ?? code);
  } catch {
    // corpo sem JSON (timeout/proxy): fica a mensagem padrao
  }
  return new Error(fallback);
}

/**
 * Invoca a edge `multiplix-dispatch` (roteador por `action`) com o JWT da
 * sessao e devolve o `data` da resposta.
 *
 * NAO use `invokeEdge` de `@/lib/supabaseHelpers`: ele nao envia o header
 * `Authorization` e esta edge exige `requireAuth` (voltaria 401). Mesmo padrao
 * ja usado em `useMultiplixAudience` e `invokeMultiplixSend`.
 */
export async function invokeMultiplixDispatch<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-dispatch', {
    body: { action, payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw await toMultiplixDispatchError(response.error);
  return (response.data as { data: T }).data;
}

/**
 * Normaliza o `data` das acoes de lista. A edge devolve as linhas dentro de
 * `data` — como lista direta (`{ data: [...] }`) ou num envelope com a
 * contagem exata (`{ data: { rows|items|recipients|dispatches: [...], total } }`).
 * Nao inventamos campo: so lemos `total` quando ele e de fato um numero.
 */
export function readMultiplixList<T>(data: unknown): MultiplixListPayload<T> {
  if (Array.isArray(data)) return { rows: data as T[], total: null };
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const key = (['rows', 'items', 'recipients', 'dispatches'] as const)
      .find((k) => Array.isArray(obj[k]));
    if (key) {
      const total = typeof obj.total === 'number' ? obj.total : null;
      return { rows: obj[key] as T[], total };
    }
  }
  throw new MultiplixDispatchEdgeError(
    'multiplix_list_shape',
    'multiplix-dispatch: resposta de lista em formato inesperado',
  );
}

/** Pagina da lista de disparos (mesmo limite que a tela ja usava: 50). */
const DISPATCH_LIST_LIMIT = 50;
/** Pagina de destinatarios que a tela pede (era o `limit(500)`). */
const RECIPIENT_LIST_LIMIT = 500;
/** Teto de linhas do fallback da contagem exata de `skipped`. */
const RECIPIENT_COUNT_PAGE_LIMIT = 1000;

export function useMultiplixDispatchesList() {
  return useQuery({
    queryKey: ['multiplix-dispatches-list'],
    queryFn: async () => {
      const data = await invokeMultiplixDispatch('dispatch.list', {
        limit: DISPATCH_LIST_LIMIT,
        offset: 0,
      });
      return readMultiplixList<MultiplixDispatch>(data).rows;
    },
    refetchInterval: 10_000,
  });
}

export function useMultiplixDispatch(dispatchId: string | null) {
  return useQuery({
    queryKey: ['multiplix-dispatch', dispatchId],
    queryFn: async () => {
      // Nao existe acao de "ler 1 por id" nesta etapa: usamos a lista (mesma
      // ordenacao/limite da tela de disparos) e localizamos o alvo. O monitor
      // abre a partir da lista de recentes ou do disparo recem-criado, entao o
      // registro esta na primeira pagina; se a acao ganhar um filtro por id
      // isto vira uma leitura direta.
      const data = await invokeMultiplixDispatch('dispatch.list', {
        limit: DISPATCH_LIST_LIMIT,
        offset: 0,
      });
      const found = readMultiplixList<MultiplixDispatch>(data).rows.find((d) => d.id === dispatchId);
      if (!found) {
        throw new MultiplixDispatchEdgeError('multiplix_dispatch_not_found', 'Disparo nao encontrado');
      }
      return found;
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

export function useMultiplixRecipients(dispatchId: string | null, statusFilter = 'all') {
  return useQuery({
    queryKey: ['multiplix-recipients', dispatchId, statusFilter],
    queryFn: async () => {
      const payload: Record<string, unknown> = {
        dispatch_id: dispatchId,
        limit: RECIPIENT_LIST_LIMIT,
        offset: 0,
      };
      if (statusFilter !== 'all') payload.status = statusFilter;
      const data = await invokeMultiplixDispatch('recipients.list', payload);
      return readMultiplixList<MultiplixRecipientRow>(data).rows;
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

/**
 * Contagem exata de destinatarios por status, via `recipients.list`.
 *
 * O monitor usa o total de `skipped` (empresa sem WhatsApp) para fechar o
 * progresso — `total_recipients`/`sent_count`/... nao contam `skipped`. O
 * contrato da acao devolve `total` (a contagem no servidor) junto das linhas.
 * Se o servidor responder SEM `total`, so aceitamos `rows.length` quando a
 * pagina NAO veio cheia (prova de que nao ha mais linhas atras do limite); uma
 * pagina cheia sem total significaria subcontagem silenciosa, entao falhamos
 * alto em vez de mostrar um numero errado.
 */
export async function fetchMultiplixRecipientsTotal(dispatchId: string, status: string): Promise<number> {
  const data = await invokeMultiplixDispatch('recipients.list', {
    dispatch_id: dispatchId,
    status,
    limit: RECIPIENT_COUNT_PAGE_LIMIT,
    offset: 0,
  });
  const { rows, total } = readMultiplixList<MultiplixRecipientRow>(data);
  if (total !== null) return total;
  if (rows.length < RECIPIENT_COUNT_PAGE_LIMIT) return rows.length;
  throw new MultiplixDispatchEdgeError(
    'multiplix_recipients_list_sem_total',
    'recipients.list nao devolveu total e a pagina veio cheia: contagem exata indisponivel',
  );
}

export interface CreateMultiplixDispatchInput {
  name: string;
  messageTemplate: string;
  /** F08: o publico e por referencia — a edge re-resolve no Singu com o escopo do JWT. */
  companyIds: string[];
  contactIds?: string[];
  scheduledAt?: string | null;
  startNow: boolean;
  /** F17: confirmacao explicita quando o total passa do teto de destinatarios. */
  confirmOverLimit?: boolean;
}

async function invokeMultiplixSend(dispatchId: string, action: 'start' | 'pause' | 'cancel') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-send', {
    body: { dispatchId, action },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw new Error(response.error.message);
  // 'start' fora da janela de envio responde 200 com {ok:false, reason,
  // next_window} em vez de status de erro (nao ha transicao pra reverter),
  // entao invoke() nao rejeita sozinho -- sem isso, "Retomar" fecha o dialog
  // como sucesso mas o disparo continua pausado.
  const body = response.data as { ok?: boolean; reason?: string } | null;
  if (body?.ok === false) {
    throw new Error(body.reason ? `Fora da janela de envio: ${body.reason}` : 'Disparo recusado pelo motor de envio');
  }
  return response.data;
}

export interface CreateMultiplixDispatchResult {
  id: string;
  recipientCount: number;
  created: boolean;
}

export function useCreateMultiplixDispatch() {
  // A chave de idempotencia tem de sobreviver ao duplo clique: a RPC e
  // idempotente por client_request_id, nao por conteudo — duas chaves geram dois
  // disparos. Fica viva enquanto a tentativa esta em voo e e liberada no fim.
  const clientRequestIdRef = useRef<string | null>(null);
  return useMutation({
    mutationFn: async (input: CreateMultiplixDispatchInput): Promise<CreateMultiplixDispatchResult> => {
      if (!clientRequestIdRef.current) clientRequestIdRef.current = crypto.randomUUID();
      const clientRequestId = clientRequestIdRef.current;
      // F08: a criacao vive no servidor. A edge multiplix-audience re-resolve o
      // publico no Singu com o escopo do JWT e chama a RPC transacional
      // multiplix_create_draft (dispatch + destinatarios numa transacao,
      // idempotente por client_request_id). O navegador nao decide mais quem
      // recebe nem escreve direto em multiplix_dispatches/multiplix_recipients.
      const draft = await createMultiplixDraft({
        name: input.name,
        message_template: input.messageTemplate,
        company_ids: input.companyIds,
        contact_ids: input.contactIds ?? [],
        client_request_id: clientRequestId,
        scheduled_at: input.scheduledAt ?? null,
        confirm_over_limit: input.confirmOverLimit ?? false,
      });
      if (!draft.dispatch_id) throw new Error('Disparo criado sem identificador');
      const dispatchId = draft.dispatch_id;

      if (input.startNow) {
        // Nao aguarda: multiplix-send processa o loop de envio inteiro dentro
        // da mesma invocacao (sleep real de digitacao/intervalo por
        // destinatario), entao esperar aqui travaria o composer pelo tempo
        // total do disparo, sem permitir pausar/cancelar/acompanhar. Dispara
        // em background e deixa o monitor (que abre logo em seguida) refletir
        // o progresso via realtime/polling; se a janela de envio recusar o
        // start, o dispatch fica em 'draft' e o botao "Iniciar" do monitor
        // permite tentar de novo (com o erro real, via toast do runAction).
        invokeMultiplixSend(dispatchId, 'start').catch((startError) => {
          // Nao e so o caso esperado (fora da janela): auth/409/500/rede
          // tambem caem aqui, e sem avisar o usuario o disparo fica parado
          // (draft) ou preso em 'sending' sem ninguem saber o motivo.
          const message = startError instanceof Error ? startError.message : 'Erro ao iniciar disparo';
          console.error('multiplix-send start (background) falhou:', startError);
          toast.error(`Disparo salvo, mas o início falhou: ${message}`);
        });
      }

      return { id: dispatchId, recipientCount: draft.recipient_count, created: draft.created };
    },
    // Libera a chave so DEPOIS que a criacao terminou: duas chamadas simultaneas
    // (duplo clique) compartilham a chave e viram UM disparo; um novo disparo
    // depois disso recebe chave nova.
    onSettled: () => { clientRequestIdRef.current = null; },
  });
}

export function useMultiplixDispatchAction() {
  return useMutation({
    mutationFn: ({ dispatchId, action }: { dispatchId: string; action: 'start' | 'pause' | 'cancel' }) =>
      invokeMultiplixSend(dispatchId, action),
  });
}
