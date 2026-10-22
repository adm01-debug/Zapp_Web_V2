import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import { toast } from 'sonner';
import { isAccessDeniedError } from '@/lib/rlsError';

export interface ConnectionStatus {
  id: string;
  instance_id: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
  /** Saúde gravada pela verificação automática do cron — exibida sem reexecutar a sonda. */
  health_status: string | null;
  last_health_check: string | null;
  health_response_ms: number | null;
}

/** Última linha de `connection_health_logs`: é o heartbeat do cron, não uma
 * invocação feita pelo navegador. */
export interface ConnectionHealthLog {
  id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface MessageDiagnostic {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  failureRate: number;
  /** Só id, horário e motivo: sem trecho de conteúdo e sem nome do contato. */
  recentFailures: Array<{
    id: string;
    created_at: string;
    motivo: string;
  }>;
}

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unauthorized' | 'unknown';

export interface SystemHealth {
  database: HealthStatus;
  storage: HealthStatus;
  realtime: HealthStatus;
  edgeFunctions: HealthStatus;
  dbLatency: number | null;
  storageLatency: number | null;
  realtimeCheckedAt: string | null;
  /** Instante do último check registrado pelo cron; `null` = nenhum registro. */
  lastHealthCheckAt: string | null;
  healthCheckLogs: ConnectionHealthLog[];
  contactsCount: number;
  messagesCount: number;
  connectionsCount: number;
}

/** Sem ack do canal dentro desta janela, o Realtime fica "não medido" (nunca "saudável"). */
const REALTIME_PROBE_TIMEOUT_MS = 5000;

interface ProbeError {
  code?: unknown;
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
}

/** Falha de AUTORIZAÇÃO (JWT/RLS/permissão) não é a mesma coisa que serviço fora do ar:
 * o operador precisa saber se a coleta foi barrada ou se o serviço não respondeu. */
function isAuthorizationError(error: ProbeError | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? error.statusCode ?? error.status ?? '');
  if (code === '401') return true;
  // 403, 42501, PGRST301 e a mensagem do RLS vêm do helper central.
  if (isAccessDeniedError(error)) return true;
  return /unauthorized|not authorized|invalid jwt/i.test(String(error.message ?? ''));
}

/** Só a latência de uma coleta BEM-SUCEDIDA vira status: erro que volta rápido não é
 * "saudável" — ele vira falha de coleta (down) ou falta de permissão (unauthorized). */
function classifyHealth(
  error: ProbeError | null,
  latency: number | null,
  healthyBelowMs: number,
  degradedBelowMs: number,
): HealthStatus {
  if (error) return isAuthorizationError(error) ? 'unauthorized' : 'down';
  if (latency === null) return 'unknown';
  if (latency < healthyBelowMs) return 'healthy';
  if (latency < degradedBelowMs) return 'degraded';
  return 'down';
}

/** O cron `connection-health-check` roda a cada 5 min e deixa o rastro em
 * `connection_health_logs`. A saúde do backend é lida desse rastro: invocar a Edge
 * pelo navegador criaria tráfego falso e poderia disparar e-mail de alerta. */
const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;
const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;

/** Sem registro não se mede: devolve "unknown" em vez de "saudável". */
function classifyHeartbeat(
  error: ProbeError | null,
  lastCheckedAt: string | null,
  agora: number,
): HealthStatus {
  if (error) return isAuthorizationError(error) ? 'unauthorized' : 'down';
  if (!lastCheckedAt) return 'unknown';
  const idade = agora - Date.parse(lastCheckedAt);
  if (!Number.isFinite(idade)) return 'unknown';
  if (idade < HEARTBEAT_SAUDAVEL_MS) return 'healthy';
  if (idade < HEARTBEAT_DEGRADADO_MS) return 'degraded';
  return 'down';
}

/** Falha de coleta não vira número: o painel precisa dizer que falhou em vez de
 * publicar "0 mensagens / 0% de falha" quando a leitura foi recusada. */
function erroDeColeta(error: ProbeError | null): string {
  const code = String(error?.code ?? error?.statusCode ?? error?.status ?? '');
  return code
    ? `A coleta de diagnósticos foi recusada ou falhou (código ${code}).`
    : 'A coleta de diagnósticos falhou; os números exibidos podem estar desatualizados.';
}

/** Realtime não se mede por latência de leitura: assina um canal e espera o ack do servidor.
 * Sem ack no prazo, devolve "unknown" (não medido) em vez de "saudável". */
async function probeRealtime(): Promise<{ status: HealthStatus; checkedAt: string | null }> {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    const opened = supabase.channel('diagnostics-realtime-probe');
    channel = opened;
    const status = await new Promise<HealthStatus>((resolve) => {
      const timer = setTimeout(() => resolve('unknown'), REALTIME_PROBE_TIMEOUT_MS);
      opened.subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve('healthy');
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve('down');
        } else if (state === 'CLOSED') {
          clearTimeout(timer);
          resolve('unknown');
        }
      }, REALTIME_PROBE_TIMEOUT_MS);
    });
    return { status, checkedAt: status === 'healthy' ? new Date().toISOString() : null };
  } catch {
    return { status: 'unknown', checkedAt: null };
  } finally {
    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch {
        // canal já encerrado — nada a limpar
      }
    }
  }
}

export interface ErrorLog {
  id: string;
  type: 'connection' | 'message' | 'system' | 'webhook';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: string;
  timestamp: Date;
}

export function useDiagnosticsData() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [messageDiag, setMessageDiag] = useState<MessageDiagnostic | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  // Uma coleta recusada/falha não pode virar zero: fica registrada e visível.
  const [coletaFalhou, setColetaFalhou] = useState<ErrorLog | null>(null);

  const fetchConnections = async () => {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, phone_number, created_at, updated_at, health_status, last_health_check, health_response_ms')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setConnections((data ?? []) as ConnectionStatus[]);
  };

  const fetchMessageDiagnostics = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Contagens da JANELA de 24 h (indexadas) são exatas: alimentam taxas que
    // não podem mentir. O que não pode existir é COUNT exato da tabela inteira.
    const contagens = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'sent'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'delivered'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'read'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'failed'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'sending'),
    ]);

    // Qualquer leitura recusada (RLS) aborta o agregado: sem zeros silenciosos.
    const erroContagem = contagens.find((r) => r.error)?.error ?? null;
    if (erroContagem) throw erroContagem;

    const [
      { count: totalCount },
      { count: sentCount },
      { count: deliveredCount },
      { count: readCount },
      { count: failedCount },
      { count: pendingCount },
    ] = contagens;

    // A tabela `messages` não guarda o texto do erro: o motivo exibido é o status
    // devolvido pelo provedor. Nada de trecho de conteúdo nem de nome de contato.
    const { data: failures, error: falhasError } = await supabase
      .from('messages')
      .select('id, status, created_at')
      .eq('sender', 'agent')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(10);
    if (falhasError) throw falhasError;

    const recentFailures: MessageDiagnostic['recentFailures'] = (failures ?? []).map((f) => ({
      id: f.id,
      created_at: f.created_at,
      motivo: f.status || 'desconhecido',
    }));

    const total = totalCount || 0;
    const sent = sentCount || 0;
    const delivered = deliveredCount || 0;
    const read = readCount || 0;
    const failed = failedCount || 0;
    const pending = pendingCount || 0;

    setMessageDiag({
      total, sent, delivered, read, failed, pending,
      deliveryRate: total > 0 ? Math.round(((delivered + read) / total) * 100) : 0,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      recentFailures,
    });
  };

  const fetchSystemHealth = async () => {
    // Sonda LEVE: a latência vem de `select id limit 1`, não de um COUNT de
    // tabela inteira (que cresce com o volume e falsifica o status do banco).
    // O total de contatos aproveita a mesma ida ao banco, estimado (plano).
    const dbStart = performance.now();
    let contactsCount: number | null = null;
    let dbError: ProbeError | null = null;
    try {
      const { count, error } = await supabase
        .from('contacts')
        .select('id', { count: 'estimated' })
        .limit(1);
      contactsCount = count ?? null;
      dbError = error ?? null;
    } catch (err) {
      dbError = err as ProbeError;
    }
    // Latência só vale para coleta bem-sucedida; erro rápido não pode virar "healthy".
    const dbLatency = dbError ? null : Math.round(performance.now() - dbStart);

    const storageStart = performance.now();
    let storageError: ProbeError | null = null;
    try {
      const { error } = await supabase.storage.from('whatsapp-media').list('', { limit: 1 });
      storageError = error ?? null;
    } catch (err) {
      storageError = err as ProbeError;
    }
    const storageLatency = storageError ? null : Math.round(performance.now() - storageStart);

    // Totais ESTIMADOS: não varrem a tabela inteira a cada ciclo de polling.
    let messagesCount: number | null = null;
    let messagesCountError: ProbeError | null = null;
    try {
      const { count, error } = await supabase
        .from('messages').select('id', { count: 'estimated', head: true });
      messagesCount = count ?? null;
      messagesCountError = error ?? null;
    } catch (err) {
      messagesCountError = err as ProbeError;
    }
    // Falha de contagem estimada não pode passar em branco — propaga para o
    // bloco catch de fetchAll, que a torna visível via coletaFalhou.
    if (messagesCountError) throw messagesCountError;

    let connectionsCount: number | null = null;
    let connectionsCountError: ProbeError | null = null;
    try {
      const { count, error } = await supabase
        .from('whatsapp_connections').select('id', { count: 'estimated', head: true });
      connectionsCount = count ?? null;
      connectionsCountError = error ?? null;
    } catch (err) {
      connectionsCountError = err as ProbeError;
    }

    const realtime = await probeRealtime();

    // Backend vivo = rastro deixado pelo cron. O navegador não dispara a sonda:
    // cada invocação da Edge gera tráfego falso e pode mandar e-mail de alerta.
    let healthCheckLogs: ConnectionHealthLog[] = [];
    let heartbeatError: ProbeError | null = null;
    try {
      const { data, error } = await supabase
        .from('connection_health_logs')
        .select('id, instance_id, status, response_time_ms, error_message, checked_at')
        .order('checked_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20);
      if (error) heartbeatError = error;
      else healthCheckLogs = (data ?? []) as ConnectionHealthLog[];
    } catch (err) {
      heartbeatError = err as ProbeError;
    }
    const lastHealthCheckAt = healthCheckLogs[0]?.checked_at ?? null;

    // Latência só é exibida quando nenhum erro de banco ocorreu. Se a query de
    // contatos sucedeu mas a de connections falhou, a latência medida NÃO representa
    // o estado do banco (que ficou 'down' por connectionsCountError) — exibi-la
    // como "Latência crítica: Xms" seria enganoso (Qodo Finding 4).
    const dbLatencyFinal = (dbError ?? connectionsCountError) ? null : dbLatency;
    setHealth({
      database: classifyHealth(dbError ?? connectionsCountError, dbLatencyFinal, 500, 2000),
      storage: classifyHealth(storageError, storageLatency, 1000, 3000),
      realtime: realtime.status,
      edgeFunctions: classifyHeartbeat(heartbeatError, lastHealthCheckAt, Date.now()),
      dbLatency: dbLatencyFinal,
      storageLatency,
      realtimeCheckedAt: realtime.checkedAt,
      lastHealthCheckAt,
      healthCheckLogs,
      contactsCount: contactsCount ?? 0,
      messagesCount: messagesCount ?? 0,
      connectionsCount: connectionsCount ?? 0,
    });
  };

  const fetchErrorLogs = async () => {
    const logs: ErrorLog[] = [];

    // Só id, horário e motivo: o log não expõe conteúdo nem contato.
    const { data: failedMsgs, error: failedError } = await supabase
      .from('messages')
      .select('id, status, created_at')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);
    if (failedError) throw failedError;

    if (failedMsgs) {
      for (const msg of failedMsgs) {
        logs.push({
          id: `msg-${msg.id}`,
          type: 'message',
          severity: 'error',
          message: `Falha no envio da mensagem ${msg.id}`,
          details: `Motivo informado pelo provedor: ${msg.status || 'desconhecido'}`,
          timestamp: new Date(msg.created_at),
        });
      }
    }

    const { data: disconnected, error: disconnectedError } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, updated_at')
      .neq('status', 'connected');
    if (disconnectedError) throw disconnectedError;

    if (disconnected) {
      for (const conn of disconnected) {
        logs.push({
          id: `conn-${conn.id}`,
          type: 'connection',
          severity: 'critical',
          message: `Conexão ${conn.instance_id} desconectada`,
          details: `Status: ${conn.status || 'desconhecido'}. Última atualização: ${conn.updated_at}`,
          timestamp: new Date(conn.updated_at),
        });
      }
    }

    // Órfãos: excluído não é órfão — senão o painel alarma por dado já removido.
    const { count: orphanCount, error: orphanError } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('whatsapp_connection_id', null)
      .is('deleted_at', null);
    if (orphanError) throw orphanError;

    if (orphanCount && orphanCount > 0) {
      logs.push({
        id: 'orphan-contacts',
        type: 'system',
        severity: 'warning',
        message: `${orphanCount} contato(s) sem conexão WhatsApp`,
        details: 'Esses contatos não receberão mensagens enviadas pelo sistema. Vincule-os a uma conexão.',
        timestamp: new Date(),
      });
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: stuckCount, error: stuckError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sending')
      .lt('created_at', fiveMinAgo)
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (stuckError) throw stuckError;

    if (stuckCount && stuckCount > 0) {
      logs.push({
        id: 'stuck-messages',
        type: 'message',
        severity: 'warning',
        message: `${stuckCount} mensagem(ns) travada(s) no status "enviando"`,
        details: 'Mensagens com mais de 5 minutos no status "sending". Pode indicar problemas com a Evolution API.',
        timestamp: new Date(),
      });
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setErrorLogs(logs);
  };

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchConnections(),
        fetchMessageDiagnostics(),
        fetchSystemHealth(),
        fetchErrorLogs(),
      ]);
      setLastRefresh(new Date());
      setColetaFalhou(null);
    } catch (err) {
      // Nada de número falso: a falha da coleta vira registro VISÍVEL no painel.
      setColetaFalhou({
        id: 'collect-error',
        type: 'system',
        severity: 'error',
        message: 'Falha ao coletar os diagnósticos',
        details: erroDeColeta(err as ProbeError),
        timestamp: new Date(),
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Polling só com a aba visível e a rede no ar — uma leitura por vez.
  useVisiblePolling(fetchAll, 30_000);

  const handleRefresh = async () => {
    toast.info('Atualizando diagnósticos...');
    await fetchAll();
    toast.success('Diagnósticos atualizados!');
  };

  // A falha de coleta entra no topo (é a mais nova) e conta como erro crítico.
  const logsVisiveis = coletaFalhou ? [coletaFalhou, ...errorLogs] : errorLogs;
  const errorCount = logsVisiveis.filter(l => l.severity === 'error' || l.severity === 'critical').length;
  const warningCount = logsVisiveis.filter(l => l.severity === 'warning').length;
  const connectedCount = connections.filter(c => c.status === 'connected').length;

  return {
    loading, refreshing, lastRefresh,
    connections, messageDiag, health, errorLogs: logsVisiveis,
    handleRefresh,
    errorCount, warningCount, connectedCount,
    collectionError: coletaFalhou?.details ?? null,
  };
}
