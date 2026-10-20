import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/**
 * t_9cc4f1c2 — trilha de auditoria de UMA conexão (só leitura).
 *
 * A trilha vive em public.audit_logs. A RLS já libera SELECT para
 * admin/supervisor (policy "Admins can view audit logs"), então o front lê
 * direto — sem Edge Function nova. A conexão é identificada pelo MESMO contrato
 * que o CX0b (exclusão admin-only) e a V3 já gravam: `details.instance_id`.
 *
 * Nada de dado pessoal entra na consulta: só id, ação, autor e data. Telefone,
 * QR, token e conteúdo de conversa nunca são lidos.
 */

export const CONNECTION_AUDIT_PAGE_SIZE = 20;

/** Colunas explícitas — a tela nunca pede a linha inteira. */
const CONNECTION_AUDIT_COLUMNS = 'id, action, user_id, created_at';

export interface ConnectionAuditEntry {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
}

export interface ConnectionAuditPage {
  entries: ConnectionAuditEntry[];
  actorNames: Map<string, string>;
  total: number;
}

// Rótulos pt-BR das ações de conexão. Ação desconhecida (de cartão futuro) cai
// no fallback legível — a tela nunca esconde nem inventa evento.
const CONNECTION_AUDIT_ACTION_LABELS: Record<string, string> = {
  connection_created: 'Conexão criada',
  connection_connected: 'Conexão pareada (QR)',
  connection_disconnected: 'Conexão desconectada',
  connection_deleted: 'Conexão excluída',
};

export function connectionAuditActionLabel(action: string): string {
  const known = CONNECTION_AUDIT_ACTION_LABELS[action];
  if (known) return known;
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Lê UMA página da trilha da conexão (`instanceId` = details.instance_id). */
export async function fetchConnectionAuditPage(
  instanceId: string,
  page: number,
): Promise<ConnectionAuditPage> {
  const from = page * CONNECTION_AUDIT_PAGE_SIZE;
  const to = from + CONNECTION_AUDIT_PAGE_SIZE - 1;

  const { data, count, error } = await supabase
    .from('audit_logs')
    .select(CONNECTION_AUDIT_COLUMNS, { count: 'exact' })
    .contains('details', { instance_id: instanceId })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const entries = (data ?? []) as ConnectionAuditEntry[];

  // "Quem": audit_logs.user_id é o id do auth; profiles.user_id guarda o mesmo
  // id. Falha na resolução do nome não derruba a trilha.
  const ids = [...new Set(entries.map((e) => e.user_id).filter((id): id is string => Boolean(id)))];
  let actorNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', ids);
    if (profilesError) {
      // O nome é cosmético: sem ele a trilha ainda mostra "quem" pelo autor não
      // resolvido. Registra a falha em vez de fingir que não houve evento.
      log.warn('auditoria de conexão: falha ao resolver nomes', {
        instanceId,
        code: profilesError.code,
      });
    } else {
      actorNames = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));
    }
  }

  return { entries, actorNames, total: count ?? 0 };
}

export interface ConnectionAuditLogsState {
  entries: ConnectionAuditEntry[];
  actorNames: Map<string, string>;
  total: number;
  page: number;
  pageCount: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
}

/** Carrega a trilha sob demanda — só busca quando o diálogo está aberto. */
export function useConnectionAuditLogs(
  instanceId: string | null,
  open: boolean,
): ConnectionAuditLogsState {
  const [entries, setEntries] = useState<ConnectionAuditEntry[]>([]);
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Descarta resposta de uma página/conexão que já foi trocada.
  const requestRef = useRef(0);

  const load = useCallback(
    async (targetPage: number) => {
      if (!open || !instanceId) return;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchConnectionAuditPage(instanceId, targetPage);
        if (requestRef.current !== requestId) return;
        setEntries(result.entries);
        setActorNames(result.actorNames);
        setTotal(result.total);
      } catch {
        if (requestRef.current !== requestId) return;
        setEntries([]);
        setActorNames(new Map());
        setTotal(0);
        setError('Não foi possível carregar a auditoria.');
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [instanceId, open],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-demand padrão (mesmo padrão do AuditLogDashboard); sem estado derivado de props.
    if (open) void load(page);
  }, [open, page, load]);

  const pageCount = Math.max(1, Math.ceil(total / CONNECTION_AUDIT_PAGE_SIZE));

  return {
    entries,
    actorNames,
    total,
    page,
    pageCount,
    loading,
    error,
    setPage: (next: number) => setPage(Math.max(0, next)),
  };
}
