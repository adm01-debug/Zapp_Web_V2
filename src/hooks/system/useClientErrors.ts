import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows, type PageResult } from '@/lib/fetchAllRows';

/**
 * Leitura dos erros de runtime do navegador gravados por `@/lib/errorReporter` em
 * `audit_logs` (action = 'client_error', details = { message, stack, path, buildId,
 * sessionId }). A tabela é admin-only por RLS — mesma porta da aba de consultas.
 *
 * O agrupamento é por **mensagem normalizada + rota**: ids/números/timestamps voláteis
 * viram `#` para que "Failed to fetch /v1/abc123" e "Failed to fetch /v1/def456" contem
 * como o mesmo defeito. A janela do período é decidida por quem chama (a tela reusa o
 * filtro de período da telemetria e passa o instante inicial em ISO).
 */

export interface ClientErrorRow {
  id: string;
  created_at: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
}

export interface ClientErrorGroup {
  /** Chave estável do grupo: mensagem normalizada + rota. */
  key: string;
  /** Mensagem normalizada (partes voláteis substituídas por `#`). */
  message: string;
  /** Rota (pathname) onde o erro ocorreu. */
  route: string;
  /** Quantas linhas do período caíram neste grupo. */
  count: number;
  /** Instante ISO da ocorrência mais recente do grupo. */
  lastSeenIso: string;
  /** Sessões de aba distintas que reportaram o grupo (0 quando o log não trouxe sessionId). */
  sessions: number;
}

export interface ClientErrorsData {
  groups: ClientErrorGroup[];
  /** Total de linhas lidas no período (não de grupos). */
  totalErrors: number;
  /** `true` quando a varredura não cobriu o período inteiro (teto de páginas ou falha no meio). */
  incomplete: boolean;
  /** Presente só quando a leitura falhou: a tela NUNCA pode mostrar "sem erros" nesse caso. */
  error: { message: string } | null;
}

const SEM_MENSAGEM = '(sem mensagem)';
const SEM_ROTA = '(rota desconhecida)';

// Voláteis que não podem separar o mesmo defeito em grupos diferentes.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE = /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?/gi;
const HEX_RE = /\b[0-9a-f]{12,}\b/gi;
const QUERY_RE = /\?[^\s]*/g;
const NUM_RE = /\d+/g;

/** Normaliza a mensagem para agrupar ocorrências do mesmo defeito: ids, números, hashes,
 *  timestamps e query strings viram `#`/vazio. Determinístico e sem dependência externa. */
export function normalizeClientErrorMessage(message: string): string {
  const limpa = message
    .replace(UUID_RE, '#')
    .replace(ISO_RE, '#')
    .replace(HEX_RE, '#')
    .replace(QUERY_RE, '')
    .replace(NUM_RE, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return limpa ? limpa.slice(0, 200) : SEM_MENSAGEM;
}

function campoTexto(details: Record<string, unknown> | null, campo: string): string {
  if (!details) return '';
  const valor = details[campo];
  return typeof valor === 'string' ? valor : '';
}

function mensagemDaLinha(row: ClientErrorRow): string {
  return campoTexto(row.details, 'message') || SEM_MENSAGEM;
}

function rotasDaLinha(row: ClientErrorRow): string {
  return campoTexto(row.details, 'path') || SEM_ROTA;
}

/** Agrupa as linhas por mensagem normalizada + rota, com contagem e última ocorrência. */
export function groupClientErrors(rows: ClientErrorRow[]): ClientErrorGroup[] {
  const mapa = new Map<
    string,
    { group: ClientErrorGroup; lastSeenMs: number; sessions: Set<string> }
  >();

  for (const row of rows) {
    const message = normalizeClientErrorMessage(mensagemDaLinha(row));
    const route = rotasDaLinha(row);
    const key = `${message}|${route}`;
    const sessionId = campoTexto(row.details, 'sessionId');

    let entrada = mapa.get(key);
    if (!entrada) {
      entrada = {
        group: { key, message, route, count: 0, lastSeenIso: '', sessions: 0 },
        lastSeenMs: Number.NEGATIVE_INFINITY,
        sessions: new Set<string>(),
      };
      mapa.set(key, entrada);
    }

    entrada.group.count += 1;
    if (sessionId) entrada.sessions.add(sessionId);
    const t = Date.parse(row.created_at);
    if (Number.isFinite(t) && t >= entrada.lastSeenMs) {
      entrada.lastSeenMs = t;
      entrada.group.lastSeenIso = row.created_at;
    }
  }

  return [...mapa.values()]
    .map((entrada) => ({ ...entrada.group, sessions: entrada.sessions.size }))
    .sort((a, b) => b.count - a.count || b.lastSeenIso.localeCompare(a.lastSeenIso));
}

const CLIENT_ERROR_PAGE_SIZE = 500;
/** Trava de segurança: 20 páginas × 500 = teto de 10 mil linhas por período. */
const CLIENT_ERROR_MAX_PAGES = 20;

export async function fetchClientErrors(sinceIso: string): Promise<ClientErrorsData> {
  // Leitura paginada: sem `.range()` o PostgREST devolve só a primeira página (teto do
  // projeto) e as ocorrências seguintes ficariam fora da contagem. Ordem por `created_at`
  // + `id` mantém a paginação estável (id é a chave única).
  const read = await fetchAllRows<ClientErrorRow>(
    (from, to) =>
      supabase
        .from('audit_logs')
        .select('id, created_at, user_id, details')
        .eq('action', 'client_error')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<ClientErrorRow>>,
    { pageSize: CLIENT_ERROR_PAGE_SIZE, maxPages: CLIENT_ERROR_MAX_PAGES },
  );

  return {
    groups: groupClientErrors(read.rows),
    totalErrors: read.rows.length,
    incomplete: read.incomplete,
    error: read.error ?? null,
  };
}

export function useClientErrors(sinceIso: string) {
  const query = useQuery({
    queryKey: ['client-errors', sinceIso],
    queryFn: () => fetchClientErrors(sinceIso),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // `fetchAllRows` nunca lança: erro de leitura vem no payload. A tela precisa disso como
  // falha explícita — senão "permission denied" apareceria como "Nenhum erro no período".
  const readError = query.data?.error ?? null;

  return {
    groups: query.data?.groups ?? [],
    totalErrors: query.data?.totalErrors ?? 0,
    incomplete: query.data?.incomplete ?? false,
    loading: query.isLoading,
    isError: query.isError || readError !== null,
    error: query.error ?? readError,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
