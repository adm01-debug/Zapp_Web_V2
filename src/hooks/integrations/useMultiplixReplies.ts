/**
 * Retornos (respostas) de um disparo Multiplix — camada UNICA de leitura.
 *
 * Fonte: action `status` da edge `multiplix-dispatch` (TL-044A), que devolve
 * `data.by_recipient` com, por destinatario, `replied_at` (ISO do PRIMEIRO
 * retorno, escolhido no servidor) e `reply_attribution` (`linked` | `inferred`
 * do MESMO item) — as duas chaves sao nulas quando o destinatario nao respondeu.
 *
 * `contact_id`: o recorte por destinatario NAO carrega contato
 * (`multiplix_recipients` guarda `destino_e164` + `company_id`, e o F62
 * correlaciona a resposta pelo TELEFONE). O contato da conversa e entao
 * derivado pelo MESMO telefone (`destino_e164`), na regra de
 * `@/lib/calls/phone`: comparacao por E.164 completo, sufixo de 8 digitos
 * NUNCA casa e empate nao escolhe ninguem. Sem contato unico, `contact_id`
 * fica `null` e a tela nao abre conversa — nunca a de outro contato.
 *
 * A leitura de `contacts` e direta (tabela do proprio Zapp, com RLS por
 * usuario) porque e assim que o resto do produto resolve contato por telefone
 * (funil VoIP, `findContactByPhone`). As tabelas `multiplix_*` continuam
 * saindo SO pela edge, que aplica o escopo do usuario no servidor.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeE164BR, phoneQueryVariants, pickUniquePhoneMatch } from '@/lib/calls/phone';
import { MultiplixDispatchEdgeError, invokeMultiplixDispatch } from './useMultiplixDispatches';

/** `linked` = a resposta citou uma mensagem nossa; `inferred` = janela + telefone. */
export type MultiplixReplyAttribution = 'linked' | 'inferred';

/** Um retorno (resposta de contato) de um disparo. */
export interface MultiplixReply {
  /** Destinatario do disparo que respondeu (a empresa). */
  recipient_id: string;
  /**
   * Contato do Zapp dono da conversa (para abrir o chat), derivado pelo
   * telefone do destinatario. `null` = nenhum contato casou em E.164 ou mais de
   * um casou (ambiguo) — nunca um vinculo por sufixo de numero.
   */
  contact_id: string | null;
  /** Empresa (`company_id` do Singu) do destinatario, quando veio. */
  company_id: string | null;
  company_name: string | null;
  /** Telefone do destinatario — a chave com que o retorno foi correlacionado. */
  destino_e164: string | null;
  /** ISO do PRIMEIRO retorno do destinatario (nunca nulo numa linha de retorno). */
  replied_at: string;
  /**
   * Atribuicao do MESMO item do `replied_at`. `null` quando o dado veio sem
   * atribuicao registrada (a coluna aceita NULL, e a edge repassa a coluna):
   * a tela mostra o retorno e nao afirma `linked` nem `inferred`.
   */
  reply_attribution: MultiplixReplyAttribution | null;
}

/**
 * Estado do carregamento — a tela decide pelo `status`, nunca por
 * `replies.length === 0`:
 * - `idle`    = nenhum disparo selecionado (nada foi pedido);
 * - `loading` = primeira carga em andamento (`replies` ainda vazio de verdade);
 * - `error`   = a carga falhou e NAO ha lista para mostrar (ver `error`);
 * - `empty`   = o servidor confirmou que o disparo nao tem nenhum retorno;
 * - `ready`   = ha retornos para mostrar.
 */
export type MultiplixRepliesStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

export interface MultiplixRepliesResult {
  /** Retornos, do mais recente para o mais antigo; vazio quando nao ha `ready`. */
  replies: MultiplixReply[];
  status: MultiplixRepliesStatus;
  /**
   * Ultima falha. Continua preenchido quando uma RECARGA falha com a lista
   * anterior na tela (nesse caso `status` segue `ready`/`empty` — o dados a
   * tela nao some por causa de um erro de atualizacao, mas o erro nao some).
   */
  error: Error | null;
  /** Recarga com lista anterior na tela (o `status` nao volta para `loading`). */
  isRefreshing: boolean;
  refetch: () => void;
}

/** Teto de candidatos por telefone — o mesmo do funil VoIP (`findContactByPhone`). */
const CONTACT_LOOKUP_LIMIT = 5;

const ATTRIBUTIONS: readonly MultiplixReplyAttribution[] = ['linked', 'inferred'];

interface ByRecipientRow {
  recipient_id?: unknown;
  company_id?: unknown;
  company_name?: unknown;
  destino_e164?: unknown;
  replied_at?: unknown;
  reply_attribution?: unknown;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Le `data.by_recipient` do corpo devolvido pela edge (`{ data: { ... } }` ou o
 * recorte direto). Formato desconhecido NAO vira lista vazia: falha nomeada.
 */
function readByRecipient(body: unknown): ByRecipientRow[] {
  const envelope = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const inner = envelope && 'data' in envelope ? envelope.data : body;
  const rows = inner !== null && typeof inner === 'object' && !Array.isArray(inner)
    ? (inner as Record<string, unknown>).by_recipient
    : undefined;
  if (!Array.isArray(rows)) {
    throw new MultiplixDispatchEdgeError(
      'multiplix_replies_shape',
      'multiplix-dispatch: resposta de retornos em formato inesperado (sem `by_recipient`)',
    );
  }
  return rows as ByRecipientRow[];
}

/**
 * TL-044A e o contrato que carrega o retorno. Numa edge anterior a ela o corte
 * `by_recipient` existe SEM `replied_at` — ler isso como "ninguem respondeu"
 * seria uma lista vazia mentirosa, entao falhamos alto.
 */
function assertReplyContract(rows: readonly ByRecipientRow[]): void {
  const missing = rows.some((row) => !('replied_at' in row) || !('reply_attribution' in row));
  if (missing) {
    throw new MultiplixDispatchEdgeError(
      'multiplix_replies_contrato',
      'multiplix-dispatch: `status` sem `replied_at`/`reply_attribution` por destinatario (TL-044A) — a lista de retornos sairia vazia por engano',
    );
  }
}

function toReply(row: ByRecipientRow): MultiplixReply | null {
  const repliedAt = nonEmptyString(row.replied_at);
  if (repliedAt === null) return null; // destinatario sem retorno
  const recipientId = nonEmptyString(row.recipient_id);
  if (recipientId === null) {
    throw new MultiplixDispatchEdgeError(
      'multiplix_replies_shape',
      'multiplix-dispatch: retorno sem `recipient_id`',
    );
  }
  const rawAttribution = nonEmptyString(row.reply_attribution);
  const attribution = rawAttribution !== null
    && (ATTRIBUTIONS as readonly string[]).includes(rawAttribution)
    ? rawAttribution as MultiplixReplyAttribution
    : null;
  return {
    recipient_id: recipientId,
    contact_id: null, // preenchido depois, pelo telefone
    company_id: nonEmptyString(row.company_id),
    company_name: nonEmptyString(row.company_name),
    destino_e164: nonEmptyString(row.destino_e164),
    replied_at: repliedAt,
    reply_attribution: attribution,
  };
}

/**
 * Ordem determinista: retorno mais recente primeiro, desempate pelo
 * `recipient_id`. Timestamp ilegivel nunca ganha de um valido (vai para o fim),
 * a mesma regra que a edge usa para escolher o PRIMEIRO retorno do destinatario.
 */
function compareRepliesDesc(a: MultiplixReply, b: MultiplixReply): number {
  const at = Date.parse(a.replied_at);
  const bt = Date.parse(b.replied_at);
  const aValid = !Number.isNaN(at);
  const bValid = !Number.isNaN(bt);
  if (aValid && bValid && at !== bt) return bt - at;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return a.recipient_id.localeCompare(b.recipient_id);
}

/**
 * Contato do Zapp por telefone, na regra de `@/lib/calls/phone` (E.164 completo).
 * Nenhum candidato, empate entre candidatos ou conjunto cortado devolvem `null`
 * — nunca um vinculo adivinhado.
 *
 * Uma consulta POR telefone em vez de um `in`/`or` com todos: a resposta do
 * PostgREST e capada em 1.000 linhas, e um corte silencioso num lote grande
 * poderia transformar um telefone ambiguo em "unico" — abrindo a conversa de
 * outro contato. Por isso a pagina vem com `.order('id')` (conjunto
 * determinista) e uma pagina CHEIA nao afirma unicidade. A falha da consulta
 * NAO vira `contact_id` nulo em silencio: propaga.
 */
async function resolveContactIdsByPhone(phones: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(
    phones.map((phone) => normalizeE164BR(phone)).filter((e164): e164 is string => e164 !== null),
  ));
  const byPhone = new Map<string, string>();
  await Promise.all(wanted.map(async (e164) => {
    const variants = phoneQueryVariants(e164);
    if (variants.length === 0) return;
    const { data, error } = await supabase
      .from('contacts')
      .select('id, phone')
      .or(variants.map((variant) => `phone.eq.${variant}`).join(','))
      .order('id', { ascending: true })
      .limit(CONTACT_LOOKUP_LIMIT);
    if (error) throw new Error(`Falha ao buscar o contato do retorno: ${error.message}`);
    const candidates = (data ?? []) as { id: string; phone: string | null }[];
    // Pagina cheia: pode haver candidato atras do teto — sem o conjunto
    // completo nao se afirma contato unico.
    if (candidates.length >= CONTACT_LOOKUP_LIMIT) return;
    const contactId = pickUniquePhoneMatch(candidates, e164);
    if (contactId !== null) byPhone.set(e164, contactId);
  }));
  return byPhone;
}

/** Retornos de um disparo, ja ordenados e com o contato da conversa resolvido. */
async function fetchMultiplixReplies(dispatchId: string): Promise<MultiplixReply[]> {
  const body = await invokeMultiplixDispatch('status', { dispatch_id: dispatchId });
  const rows = readByRecipient(body);
  assertReplyContract(rows);
  const replies = rows
    .map(toReply)
    .filter((reply): reply is MultiplixReply => reply !== null)
    .sort(compareRepliesDesc);
  // Sem retorno nenhum nao se consulta contato: a lista vazia e a resposta.
  if (replies.length === 0) return [];
  const contactIds = await resolveContactIdsByPhone(replies.map((reply) => reply.destino_e164));
  return replies.map((reply) => {
    const e164 = normalizeE164BR(reply.destino_e164);
    return { ...reply, contact_id: e164 === null ? null : contactIds.get(e164) ?? null };
  });
}

function resolveStatus(
  dispatchId: string | null,
  hasData: boolean,
  isEmpty: boolean,
  isError: boolean,
): MultiplixRepliesStatus {
  if (!dispatchId) return 'idle';
  if (hasData) return isEmpty ? 'empty' : 'ready';
  return isError ? 'error' : 'loading';
}

/**
 * Retornos de UM disparo, tipados e com estado explicito (ver
 * `MultiplixRepliesStatus`).
 *
 * Sem `refetchInterval` de proposito: a leitura inclui a resolucao de contato
 * por telefone, que nao precisa ser refeita a cada polling — quem quiser
 * atualizar chama `refetch`.
 */
export function useMultiplixReplies(dispatchId: string | null): MultiplixRepliesResult {
  const query = useQuery({
    queryKey: ['multiplix-replies', dispatchId],
    queryFn: () => fetchMultiplixReplies(dispatchId as string),
    enabled: !!dispatchId,
  });

  const replies = query.data ?? [];
  return {
    replies,
    status: resolveStatus(dispatchId, query.data !== undefined, replies.length === 0, query.isError),
    error: (query.error as Error | null) ?? null,
    isRefreshing: query.data !== undefined && query.isFetching,
    refetch: () => { void query.refetch(); },
  };
}
