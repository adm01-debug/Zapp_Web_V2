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

/** Lista de destinatarios entregue ao monitor, com a continuacao preservada. */
export interface MultiplixRecipientList {
  rows: MultiplixRecipientRow[];
  /** Contagem exata no servidor (`meta.total`) ou `null` quando nao veio. */
  total: number | null;
  /** true quando o teto de paginas foi atingido e ainda havia mais linhas atras. */
  truncated: boolean;
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
export async function invokeMultiplixDispatch(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-dispatch', {
    body: { action, payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw await toMultiplixDispatchError(response.error);
  // Devolve o corpo INTEIRO (`{ data, meta }`): o `meta.total` e a continuacao
  // da lista — quem desembrulha e o `readMultiplixList`, que sabe ler o total
  // do `data` ou do `meta`, em vez de jogar fora a contagem no caminho.
  return response.data;
}

/**
 * Normaliza o `data` das acoes de lista. A edge devolve as linhas dentro de
 * `data` — como lista direta (`{ data: [...] }`), num envelope com a contagem
 * exata (`{ data: { rows|items|recipients|dispatches: [...], total } }`) ou no
 * envelope de transporte `{ data: rows, meta: { limit, offset, total } }`.
 * Nao inventamos campo: so lemos `total` quando ele e de fato um numero.
 */
export function readMultiplixList<T>(data: unknown): MultiplixListPayload<T> {
  if (Array.isArray(data)) return { rows: data as T[], total: null };
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Envelope da edge: `{ data: rows|envelope, meta: { ..., total } }`. O total
    // do `data` tem prioridade; o `meta.total` cobre a resposta real do
    // `recipients.list`/`dispatch.list` (count exato via PostgREST).
    if ('data' in obj) {
      const inner = readMultiplixList<T>(obj.data);
      if (inner.total !== null) return inner;
      const meta = obj.meta;
      const metaTotal = meta && typeof meta === 'object'
        && typeof (meta as Record<string, unknown>).total === 'number'
        ? (meta as Record<string, unknown>).total as number
        : null;
      return { rows: inner.rows, total: metaTotal };
    }
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
/**
 * Teto de paginas do monitor: 20 x 500 = 10 000 destinatarios por consulta.
 * Sem teto, um servidor que ignore o `offset` e nao devolva `total` deixaria o
 * laco eterno; ao atingir o teto a lista e marcada como amostra (nunca truncada
 * em silencio).
 */
const RECIPIENT_MAX_PAGES = 20;

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
      // O id viaja no payload: a edge aplica o recorte (`dispatch_id`) no MESMO
      // WHERE do escopo de dono e devolve o disparo mesmo que ele NAO esteja
      // entre os `DISPATCH_LIST_LIMIT` mais recentes. Sem o filtro a resposta
      // era so a primeira pagina de recentes e o monitor abria "Disparo nao
      // encontrado" para qualquer disparo mais antigo.
      const data = await invokeMultiplixDispatch('dispatch.list', {
        limit: DISPATCH_LIST_LIMIT,
        offset: 0,
        dispatch_id: dispatchId,
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

/**
 * Destinatarios de um disparo, paginando PELO TOTAL do servidor.
 *
 * R2-MOD-022: pedir so `limit=500/offset=0` e devolver unicamente as linhas
 * descartava a continuacao — um disparo com 501+ destinatarios nunca mostrava
 * do 501 em diante, e o operador nao tinha como saber que havia mais. Aqui a
 * pagina 1 sai (offset 0) e, enquanto ela vier CHEIA e o total conhecido nao
 * tiver sido alcancado, a pagina seguinte e pedida; o teto de `RECIPIENT_MAX_PAGES`
 * corta um servidor desobediente e marca `truncated` (a tela rotula a amostra).
 */
export function useMultiplixRecipients(dispatchId: string | null, statusFilter = 'all') {
  return useQuery({
    queryKey: ['multiplix-recipients', dispatchId, statusFilter],
    queryFn: async (): Promise<MultiplixRecipientList> => {
      const rows: MultiplixRecipientRow[] = [];
      let total: number | null = null;
      let truncated = false;
      for (let page = 0; ; page++) {
        const payload: Record<string, unknown> = {
          dispatch_id: dispatchId,
          limit: RECIPIENT_LIST_LIMIT,
          offset: page * RECIPIENT_LIST_LIMIT,
        };
        if (statusFilter !== 'all') payload.status = statusFilter;
        const data = await invokeMultiplixDispatch('recipients.list', payload);
        const parsed = readMultiplixList<MultiplixRecipientRow>(data);
        if (parsed.total !== null) total = parsed.total;
        rows.push(...parsed.rows);
        // Ultima pagina (incompleta) ou total do servidor ja alcancado: para.
        if (parsed.rows.length < RECIPIENT_LIST_LIMIT) break;
        if (total !== null && rows.length >= total) break;
        // Sem total e pagina sempre cheia: so o teto segura o laco.
        if (page + 1 >= RECIPIENT_MAX_PAGES) {
          truncated = true;
          break;
        }
      }
      return { rows, total, truncated };
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

/**
 * Identidade do pedido de criacao: os campos que definem QUAL disparo este
 * pedido cria. `startNow`/`confirmOverLimit` ficam de fora de proposito — eles
 * dizem o que fazer DEPOIS de criar, nao qual disparo e.
 */
function dispatchRequestIdentity(input: CreateMultiplixDispatchInput): string {
  return JSON.stringify([
    input.name,
    input.messageTemplate,
    input.scheduledAt ?? null,
    input.companyIds,
    input.contactIds ?? [],
  ]);
}

export function useCreateMultiplixDispatch() {
  // A chave de idempotencia tem de sobreviver ao duplo clique E a uma falha de
  // resposta: a RPC `multiplix_create_draft` e idempotente por
  // client_request_id, nao por conteudo — duas chaves geram dois disparos.
  //
  // Antes, o `onSettled` zerava a chave tambem no ERRO. Se o servidor criava o
  // disparo e a resposta se perdia (rede/timeout/5xx depois do commit), o
  // reenvio do mesmo pedido gerava chave nova e criava um SEGUNDO disparo. Agora
  // a chave so e liberada no SUCESSO; enquanto a tentativa nao confirmar, o
  // reenvio do MESMO pedido reusa a chave e a RPC devolve o disparo ja criado
  // (created=false). Se o pedido muda (nome/mensagem/publico/agendamento), e
  // outro disparo e a chave e trocada — senao a RPC devolveria o antigo,
  // silenciosamente, como se o novo tivesse sido criado.
  const attemptRef = useRef<{ key: string; identity: string } | null>(null);
  return useMutation({
    mutationFn: async (input: CreateMultiplixDispatchInput): Promise<CreateMultiplixDispatchResult> => {
      const identity = dispatchRequestIdentity(input);
      if (!attemptRef.current || attemptRef.current.identity !== identity) {
        attemptRef.current = { key: crypto.randomUUID(), identity };
      }
      const clientRequestId = attemptRef.current.key;
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
    // Libera a chave so no SUCESSO: duas chamadas simultaneas (duplo clique)
    // compartilham a chave e viram UM disparo, e um reenvio depois de uma falha
    // de resposta reaproveita a MESMA chave (a RPC devolve o disparo ja criado
    // em vez de criar outro). Um disparo novo, ou um pedido com outro conteudo,
    // recebe chave nova.
    onSuccess: () => { attemptRef.current = null; },
  });
}

export function useMultiplixDispatchAction() {
  return useMutation({
    mutationFn: ({ dispatchId, action }: { dispatchId: string; action: 'start' | 'pause' | 'cancel' }) =>
      invokeMultiplixSend(dispatchId, action),
  });
}

// ---------------------------------------------------------------------------
// Acoes de publico da edge `multiplix-dispatch` (contrato TL-041A).
//
// O front NAO resolve publico no navegador: a intencao (`manual`, `publics`,
// `filters`, `exclude`, `primary_per_company`, `select_all`) vai INTEIRA para
// a edge, que resolve os destinatarios no servidor com o escopo do JWT. O hook
// nao monta uniao, nao converte filtro em ids, nao descarta chave e nao injeta
// default — `audience.save`/`audience.apply` usam schema `.strict()` na edge e
// qualquer chave extra derruba a chamada com 400.
// ---------------------------------------------------------------------------

export type MultiplixAudienceFilterRole = 'cliente' | 'fornecedor' | 'transportadora';

export type MultiplixAudienceFilters = {
  roles?: MultiplixAudienceFilterRole[];
  ramo?: string;
  /** Duas letras (validado na edge). */
  uf?: string;
  search?: string;
};

export type MultiplixAudienceIdSet = {
  company_ids?: string[];
  contact_ids?: string[];
};

/** Um publico dentro do `publics` do select: por ids, por filtro ou por
 * referencia a um publico salvo (`audience_id`). */
export type MultiplixAudiencePublic = {
  company_ids?: string[];
  contact_ids?: string[];
  filters?: MultiplixAudienceFilters;
  audience_id?: string;
};

/** Intencao de selecao enviada a `audience.select` — vai como veio. */
export type MultiplixAudienceIntent = {
  manual?: MultiplixAudienceIdSet;
  /** Max 50 publicos (validado na edge). */
  publics?: MultiplixAudiencePublic[];
  filters?: MultiplixAudienceFilters;
  exclude?: MultiplixAudienceIdSet;
  primary_per_company?: boolean;
  select_all?: boolean;
};

/** Payload de `audience.apply` (schema `.strict()` na edge — NAO tem `publics`). */
export type MultiplixAudienceApplyInput = {
  audience_id: string;
  manual?: MultiplixAudienceIdSet;
  filters?: MultiplixAudienceFilters;
  exclude?: MultiplixAudienceIdSet;
  primary_per_company?: boolean;
  select_all?: boolean;
};

/** Aviso do modo "contato principal por empresa" devolvido pela edge. */
export type MultiplixAudiencePrimarySignal = {
  code: 'primary_not_determinable' | 'primary_conflict';
  company_id: string;
  candidates: number;
  detail: string;
};

/** Resultado de `audience.select`/`audience.apply` entregue a tela. */
export type MultiplixAudienceSelection = {
  recipients: unknown[];
  total: number;
  /** Destinatarios ELEGIVEIS depois de filtros e exclusoes. */
  eligible_count: number;
  /** Contagem no servidor antes de resolver; `null` sem filtro ativo. */
  count: number | null;
  policy_limit: number;
  primary_per_company: boolean;
  select_all: boolean;
  signals: MultiplixAudiencePrimarySignal[];
  dropped_out_of_filter: number;
  excluded_removed: number;
  audience_id?: string;
};

/** Payload de `audience.save` (schema `.strict()`): `rule` exige `definition`
 * sem `members`; `static_list` exige `members` sem `definition`. */
export type SaveMultiplixAudienceInput =
  | { name: string; kind: 'rule'; definition: MultiplixAudienceFilters }
  | { name: string; kind: 'static_list'; members: MultiplixAudienceIdSet };

export type SavedMultiplixAudience = {
  id: string;
  name: string;
  kind: 'rule' | 'static_list';
  member_count: number;
};

function multiplixAudienceShapeError(): MultiplixDispatchEdgeError {
  return new MultiplixDispatchEdgeError(
    'multiplix_audience_shape',
    'multiplix-dispatch: resposta de publico em formato inesperado',
  );
}

/** Desembrulha o envelope `{ data: {...}, meta: {...} }` do `jsonResponse`
 * da edge; tambem aceita o objeto interno direto (mesmo criterio de
 * `readMultiplixList`). */
function unwrapMultiplixAudienceData(data: unknown): Record<string, unknown> {
  let obj = data;
  if (
    obj && typeof obj === 'object' && !Array.isArray(obj)
    && 'data' in obj
    && (obj as Record<string, unknown>).data !== null
    && typeof (obj as Record<string, unknown>).data === 'object'
    && !Array.isArray((obj as Record<string, unknown>).data)
  ) {
    obj = (obj as Record<string, unknown>).data;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw multiplixAudienceShapeError();
  return obj as Record<string, unknown>;
}

/**
 * Le o resultado de `audience.select`/`audience.apply`. Os contadores vem DA
 * RESPOSTA — campo ausente ou nao numerico falha alto com
 * `multiplix_audience_shape`; NUNCA se devolve `0` inventado nem se deduz
 * contagem de `recipients.length`.
 */
export function readMultiplixAudienceSelection(data: unknown): MultiplixAudienceSelection {
  const o = unwrapMultiplixAudienceData(data);
  for (const key of ['total', 'eligible_count', 'policy_limit', 'dropped_out_of_filter', 'excluded_removed'] as const) {
    if (typeof o[key] !== 'number') throw multiplixAudienceShapeError();
  }
  if (o.count !== null && typeof o.count !== 'number') throw multiplixAudienceShapeError();
  if (typeof o.primary_per_company !== 'boolean' || typeof o.select_all !== 'boolean') {
    throw multiplixAudienceShapeError();
  }
  if (!Array.isArray(o.recipients) || !Array.isArray(o.signals)) throw multiplixAudienceShapeError();
  if (o.audience_id !== undefined && typeof o.audience_id !== 'string') throw multiplixAudienceShapeError();
  return {
    recipients: o.recipients,
    total: o.total as number,
    eligible_count: o.eligible_count as number,
    count: o.count as number | null,
    policy_limit: o.policy_limit as number,
    primary_per_company: o.primary_per_company as boolean,
    select_all: o.select_all as boolean,
    signals: o.signals as MultiplixAudiencePrimarySignal[],
    dropped_out_of_filter: o.dropped_out_of_filter as number,
    excluded_removed: o.excluded_removed as number,
    ...(typeof o.audience_id === 'string' ? { audience_id: o.audience_id } : {}),
  };
}

/** Le o resultado de `audience.save` (`{ data: { id, name, kind, member_count } }`). */
export function readMultiplixAudienceSaved(data: unknown): SavedMultiplixAudience {
  const o = unwrapMultiplixAudienceData(data);
  if (
    typeof o.id !== 'string' || typeof o.name !== 'string'
    || (o.kind !== 'rule' && o.kind !== 'static_list')
    || typeof o.member_count !== 'number'
  ) {
    throw multiplixAudienceShapeError();
  }
  return { id: o.id, name: o.name, kind: o.kind, member_count: o.member_count };
}

/** `audience.select`: envia a intencao INTEIRA, so as chaves que o chamador passou. */
export async function selectMultiplixAudience(
  intent: MultiplixAudienceIntent,
): Promise<MultiplixAudienceSelection> {
  return readMultiplixAudienceSelection(await invokeMultiplixDispatch('audience.select', intent));
}

/** `audience.save`: payload exato do input (schema `.strict()` na edge). */
export async function saveMultiplixAudience(
  input: SaveMultiplixAudienceInput,
): Promise<SavedMultiplixAudience> {
  return readMultiplixAudienceSaved(await invokeMultiplixDispatch('audience.save', input));
}

/** `audience.apply`: envia EXATAMENTE `{ audience_id, ... }` do input. */
export async function applyMultiplixAudience(
  input: MultiplixAudienceApplyInput,
): Promise<MultiplixAudienceSelection> {
  return readMultiplixAudienceSelection(await invokeMultiplixDispatch('audience.apply', input));
}

export function useMultiplixAudienceSelect() {
  return useMutation({
    mutationFn: (intent: MultiplixAudienceIntent) => selectMultiplixAudience(intent),
  });
}

export function useMultiplixAudienceSave() {
  return useMutation({
    mutationFn: (input: SaveMultiplixAudienceInput) => saveMultiplixAudience(input),
  });
}

export function useMultiplixAudienceApply() {
  return useMutation({
    mutationFn: (input: MultiplixAudienceApplyInput) => applyMultiplixAudience(input),
  });
}
