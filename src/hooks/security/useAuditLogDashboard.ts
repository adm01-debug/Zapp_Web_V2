import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * Dados do painel de Auditoria (HZ1-08).
 *
 * O defeito: os quatro cartões de resumo eram calculados no cliente sobre as
 * **200 linhas** que a lista carrega (`.limit(200)`). Numa base maior que isso o
 * "total" e o "hoje" ficavam presos no tamanho da página, sem nenhum aviso.
 * Aqui os totais vêm de contagem do servidor (`count: 'exact', head: true`) e a
 * lista continua mostrando só as 200 mais recentes.
 */

const log = getLogger('AuditLogDashboard');

/** Colunas da lista (nunca `*`). */
export const AUDIT_LOG_COLUMNS = 'id, action, entity_type, user_id, details, ip_address, created_at';
/** Tamanho da página da lista. */
export const AUDIT_LOG_PAGE = 200;
/**
 * Filtro PostgREST das ações sensíveis, espelho de `isSensitiveAction`
 * (`AuditLogDashboard.tsx`): papéis (`role_*`), exclusões e exportações.
 */
export const SENSITIVE_ACTIONS_FILTER = 'action.like.role_%,action.like.%delete%,action.like.%export%';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Filtros da tela já traduzidos em coluna/valor (o vocabulário fica na tela). */
export interface AuditLogFiltros {
  /** `.like('action', ...)` — filtro de papéis (`role_%`). */
  actionLike?: string | null;
  /** `.eq('action', ...)` — ação exata. */
  actionEq?: string | null;
  /** `.in('entity_type', ...)`. */
  entityTypes?: string[] | null;
}

export interface AuditLogStats {
  /** Todas as linhas que casam com os filtros. */
  total: number;
  /** Últimas 24 h. */
  ultimas24h: number;
  /** Ações sensíveis nas últimas 24 h. */
  sensiveis24h: number;
  /** `user_id` distintos nos últimos 7 dias. */
  usuariosUnicos7d: number;
  /** `true` quando a leitura dos usuários únicos não cobriu os 7 dias (erro ou teto de páginas). */
  usuariosUnicosIncompleto: boolean;
}

export interface AuditLogDashboardData {
  stats: AuditLogStats | null;
  logs: AuditLogRow[];
  /** `user_id` → nome (via `profiles`). Ausente quando o perfil não foi encontrado. */
  nomesPorUsuario: Record<string, string>;
  loading: boolean;
  /** Mensagem de falha da leitura; os números não são zerados em silêncio. */
  error: string | null;
  recarregar: () => void;
}

/** Builder PostgREST encadeável: cada filtro devolve o mesmo tipo. */
interface QueryBuilder<T> {
  eq: (coluna: string, valor: unknown) => T;
  like: (coluna: string, padrao: string) => T;
  in: (coluna: string, valores: string[]) => T;
  gte: (coluna: string, valor: string) => T;
  or: (filtro: string) => T;
}

type ResultadoContagem = { count: number | null; error: { message: string } | null };
type ContagemBuilder = QueryBuilder<ContagemBuilder> & PromiseLike<ResultadoContagem>;

type LeituraBuilder = QueryBuilder<LeituraBuilder> & {
  not: (coluna: string, operador: string, valor: unknown) => LeituraBuilder;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => LeituraBuilder;
  limit: (n: number) => LeituraBuilder;
  range: (de: number, ate: number) => LeituraBuilder;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const aplicarFiltros = <T extends QueryBuilder<T>>(consulta: T, filtros: AuditLogFiltros): T => {
  let query = consulta;
  if (filtros.actionLike) query = query.like('action', filtros.actionLike);
  else if (filtros.actionEq) query = query.eq('action', filtros.actionEq);
  if (filtros.entityTypes && filtros.entityTypes.length > 0) {
    query = query.in('entity_type', filtros.entityTypes);
  }
  return query;
};

/** Contagem de servidor: devolve o número de linhas que casam, sem trazer as linhas. */
export async function contarAuditoria(
  filtros: AuditLogFiltros,
  janela: { desde?: string; sensivel?: boolean } = {},
): Promise<number> {
  const base = supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true }) as unknown as ContagemBuilder;
  let query = aplicarFiltros(base, filtros);
  if (janela.desde) query = query.gte('created_at', janela.desde);
  if (janela.sensivel) query = query.or(SENSITIVE_ACTIONS_FILTER);

  const { count, error } = await (query as ContagemBuilder);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Usuários distintos nos últimos 7 dias. `COUNT(DISTINCT)` não existe no
 * PostgREST, então a leitura é paginada (só `user_id`) e a incompletude é
 * explícita — nunca um total truncado passando por total.
 */
async function contarUsuariosUnicos(
  filtros: AuditLogFiltros,
  desde: string,
): Promise<{ total: number; incompleto: boolean }> {
  const { rows, incomplete } = await fetchAllRows<{ user_id: string | null }>(async (de, ate) => {
    const base = supabase.from('audit_logs').select('user_id') as unknown as LeituraBuilder;
    const consulta = aplicarFiltros(base, filtros) as LeituraBuilder;
    return consulta
      .gte('created_at', desde)
      .not('user_id', 'is', null)
      .order('id')
      .range(de, ate) as unknown as PromiseLike<{ data: { user_id: string | null }[] | null; error: { message: string } | null }>;
  });

  const distintos = new Set(rows.map((linha) => linha.user_id).filter((id): id is string => Boolean(id)));
  return { total: distintos.size, incompleto: incomplete };
}

async function buscarPagina(filtros: AuditLogFiltros): Promise<{ logs: AuditLogRow[]; error: string | null }> {
  const base = supabase.from('audit_logs').select(AUDIT_LOG_COLUMNS) as unknown as LeituraBuilder;
  const query = aplicarFiltros(base, filtros) as LeituraBuilder;
  const { data, error } = await (query.order('created_at', { ascending: false }).limit(AUDIT_LOG_PAGE) as unknown as PromiseLike<{
    data: AuditLogRow[] | null;
    error: { message: string } | null;
  }>);
  return { logs: data ?? [], error: error?.message ?? null };
}

/** Nomes dos autores da página atual (`profiles`). Falha aqui não derruba o painel. */
async function buscarNomes(logs: AuditLogRow[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(logs.map((linha) => linha.user_id).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return {};

  const { data, error } = await supabase.from('profiles').select('id, name').in('id', ids);
  if (error) {
    log.warn('Nomes de autor indisponíveis:', error.message);
    return {};
  }
  return Object.fromEntries(
    (data ?? [])
      .filter((perfil): perfil is { id: string; name: string | null } => Boolean(perfil?.id))
      .map((perfil) => [perfil.id, perfil.name ?? '']),
  );
}

export function useAuditLogDashboard({
  actionLike = null,
  actionEq = null,
  entityTypes = null,
}: AuditLogFiltros): AuditLogDashboardData {
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [nomesPorUsuario, setNomesPorUsuario] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cada carga recebe uma geração: resposta de uma carga antiga que chega atrasada é descartada.
  const geracaoRef = useRef(0);

  const carregar = useCallback(async () => {
    const geracao = geracaoRef.current += 1;
    setLoading(true);
    const filtros: AuditLogFiltros = { actionLike, actionEq, entityTypes };
    const agora = Date.now();

    try {
      const [total, ultimas24h, sensiveis24h, unicos, pagina] = await Promise.all([
        contarAuditoria(filtros),
        contarAuditoria(filtros, { desde: new Date(agora - DIA).toISOString() }),
        contarAuditoria(filtros, { desde: new Date(agora - DIA).toISOString(), sensivel: true }),
        contarUsuariosUnicos(filtros, new Date(agora - 7 * DIA).toISOString()),
        buscarPagina(filtros),
      ]);

      if (geracao !== geracaoRef.current) return;

      setLogs(pagina.logs);
      setError(pagina.error);
      setStats({
        total,
        ultimas24h,
        sensiveis24h,
        usuariosUnicos7d: unicos.total,
        usuariosUnicosIncompleto: unicos.incompleto,
      });
      setLoading(false);

      const nomes = await buscarNomes(pagina.logs);
      if (geracao === geracaoRef.current) setNomesPorUsuario(nomes);
    } catch (err) {
      if (geracao !== geracaoRef.current) return;
      setError(err instanceof Error ? err.message : 'Falha ao carregar os totais de auditoria');
      setLoading(false);
    }
  }, [actionLike, actionEq, entityTypes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial/troca de filtro padrão (mesmo padrão do painel).
    void carregar();
  }, [carregar]);

  // Inserção nova em audit_logs atualiza totais e lista sem recarregar a página.
  // `audit_logs` está na publicação supabase_realtime
  // (supabase/migrations/20260828190000_realtime_publish_subscribed_tables.sql).
  useEffect(() => {
    const canal = supabase
      .channel('audit-logs-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        void carregar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  return { stats, logs, nomesPorUsuario, loading, error, recarregar: carregar };
}
