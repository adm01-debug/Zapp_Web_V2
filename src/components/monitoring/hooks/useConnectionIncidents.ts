import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogger } from '@/lib/logger';
import {
  CONNECTION_HEALTH_LOAD_ERROR,
  fetchConnectionHealthLogs,
  type HealthLogRow,
} from '@/services/connection-health.service';
import { HEALTHY_STATUSES, HEALTH_LOGS_LIMIT, SLA_WINDOW_MS } from './types';

const log = getLogger('ConnectionIncidents');

export type { HealthLogRow };

export interface ConnectionUptime {
  connectionId: string;
  instanceId: string;
  /** `null` = nenhum check na janela de 24 h (dado insuficiente, nunca 100%). */
  percentage: number | null;
  totalChecks: number;
  healthyChecks: number;
  /** Último check que NÃO era saudável dentro da janela. */
  lastDowntime: string | null;
}

export interface ConnectionIncident {
  id: string;
  connectionId: string;
  instanceId: string;
  startedAt: string;
  /** `null` = incidente em aberto (nenhum check saudável depois). */
  endedAt: string | null;
  /** Duração em ms: até a recuperação, ou até `now` se ainda estiver aberto. */
  durationMs: number;
  ongoing: boolean;
  /** Último `error_message` não vazio do trecho (sem telefone/token). */
  cause: string | null;
  /** Quantos checks consecutivos não saudáveis formaram o incidente. */
  checks: number;
}

export type AlertSeverity = 'critical' | 'warning';

export interface ActiveAlert {
  id: string;
  connectionId: string;
  instanceId: string;
  severity: AlertSeverity;
  title: string;
  since: string;
}

export interface ConnectionHealthAggregate {
  uptime: ConnectionUptime[];
  incidents: ConnectionIncident[];
  activeAlerts: ActiveAlert[];
}

function isHealthy(status: string): boolean {
  return HEALTHY_STATUSES.includes(status);
}

/** Ordem determinística: por `checked_at` e, em empate, por `id`. */
function byCheckedAsc(a: HealthLogRow, b: HealthLogRow): number {
  const ta = Date.parse(a.checked_at);
  const tb = Date.parse(b.checked_at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Só as linhas dentro de [now - 24h, now]. A query já traz a janela, mas a
 * função filtra de novo para ser correta isolada do transporte (e descarta
 * linhas com `checked_at` inválido, que não podem ancorar um balde).
 */
function inWindow(rows: HealthLogRow[], now: Date): HealthLogRow[] {
  const since = now.getTime() - SLA_WINDOW_MS;
  const until = now.getTime();
  return rows.filter((r) => {
    const t = Date.parse(r.checked_at);
    return !Number.isNaN(t) && t >= since && t <= until;
  });
}

function groupByConnection(rows: HealthLogRow[]): Map<string, HealthLogRow[]> {
  const groups = new Map<string, HealthLogRow[]>();
  for (const row of rows) {
    const arr = groups.get(row.connection_id);
    if (arr) arr.push(row);
    else groups.set(row.connection_id, [row]);
  }
  return groups;
}

/** Uptime de 24 h por conexão, derivado do histórico. Não fabrica 100%. */
export function computeUptime24h(rows: HealthLogRow[], now: Date): ConnectionUptime[] {
  const groups = groupByConnection(inWindow(rows, now));
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([connectionId, group]) => {
      const ordered = [...group].sort(byCheckedAsc);
      const healthy = ordered.filter((r) => isHealthy(r.status));
      const fails = ordered.filter((r) => !isHealthy(r.status));
      const lastFail = fails.length > 0 ? fails[fails.length - 1] : null;
      return {
        connectionId,
        instanceId: ordered[0].instance_id,
        percentage:
          ordered.length > 0
            ? Math.round((healthy.length / ordered.length) * 1000) / 10
            : null,
        totalChecks: ordered.length,
        healthyChecks: healthy.length,
        lastDowntime: lastFail ? lastFail.checked_at : null,
      };
    });
}

function lastCause(run: HealthLogRow[]): string | null {
  for (let i = run.length - 1; i >= 0; i--) {
    const msg = run[i].error_message;
    if (msg && msg.trim() !== '') return msg;
  }
  return null;
}

/**
 * Incidentes = trecho contínuo de checks NÃO saudáveis de uma conexão
 * (transição para desconectado/erro). Fecha quando chega um check saudável;
 * se o trecho termina sem recuperação, fica em aberto (`ongoing`).
 */
export function computeIncidents(rows: HealthLogRow[], now: Date): ConnectionIncident[] {
  const groups = groupByConnection(inWindow(rows, now));
  const incidents: ConnectionIncident[] = [];

  for (const [connectionId, group] of Array.from(groups.entries())) {
    const ordered = [...group].sort(byCheckedAsc);
    let run: HealthLogRow[] = [];
    const close = (endedAt: string | null) => {
      if (run.length === 0) return;
      const startedAt = run[0].checked_at;
      const durationMs = Math.max(
        0,
        (endedAt ? Date.parse(endedAt) : now.getTime()) - Date.parse(startedAt),
      );
      incidents.push({
        id: `${connectionId}:${run[0].id}`,
        connectionId,
        instanceId: run[0].instance_id,
        startedAt,
        endedAt,
        durationMs,
        ongoing: endedAt === null,
        cause: lastCause(run),
        checks: run.length,
      });
      run = [];
    };

    for (const row of ordered) {
      if (!isHealthy(row.status)) {
        run.push(row);
      } else {
        close(row.checked_at);
      }
    }
    close(null);
  }

  return incidents.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
}

function severityFor(incident: ConnectionIncident, rows: HealthLogRow[]): AlertSeverity {
  const last = rows
    .filter((r) => r.connection_id === incident.connectionId && !isHealthy(r.status))
    .sort(byCheckedAsc)
    .pop();
  return last && (last.status === 'disconnected' || last.status === 'error')
    ? 'critical'
    : 'warning';
}

/** Alertas ativos = incidentes ainda em aberto (conexão fora do ar agora). */
export function computeActiveAlerts(
  incidents: ConnectionIncident[],
  rows: HealthLogRow[],
): ActiveAlert[] {
  return incidents
    .filter((i) => i.ongoing)
    .map((incident) => ({
      id: incident.id,
      connectionId: incident.connectionId,
      instanceId: incident.instanceId,
      severity: severityFor(incident, rows),
      title:
        severityFor(incident, rows) === 'critical'
          ? 'Conexão indisponível'
          : 'Conexão instável',
      since: incident.startedAt,
    }));
}

/** Junta uptime, incidentes e alertas a partir do mesmo histórico. */
export function aggregateConnectionHealth(
  rows: HealthLogRow[],
  now: Date,
): ConnectionHealthAggregate {
  const incidents = computeIncidents(rows, now);
  return {
    uptime: computeUptime24h(rows, now),
    incidents,
    activeAlerts: computeActiveAlerts(incidents, rows),
  };
}

export interface UseConnectionIncidentsResult extends ConnectionHealthAggregate {
  loading: boolean;
  error: string | null;
  /** `true` quando a consulta bateu o teto e a janela não veio inteira. */
  truncated: boolean;
  lastUpdated: Date | null;
  refresh: (now?: Date) => Promise<void>;
}

/**
 * Uptime de 24 h, incidentes e alertas ativos das conexões, derivados de
 * `connection_health_logs` — sem tabela nova. A agregação no cliente roda sobre
 * uma consulta LIMITADA e ORDENADA (a RPC equivalente exigiria migration, fora
 * do escopo deste arquivo): no máximo `HEALTH_LOGS_LIMIT` linhas, das mais
 * recentes para as mais antigas, com desempate por `id`. Passado o teto,
 * `truncated` avisa que a janela ficou parcial.
 */
export function useConnectionIncidents(): UseConnectionIncidentsResult {
  const [uptime, setUptime] = useState<ConnectionUptime[]>([]);
  const [incidents, setIncidents] = useState<ConnectionIncident[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Geração de cada busca: a resposta que não é da última busca é descartada,
  // para que `loading` reflita sempre a requisição mais nova.
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (now: Date = new Date()) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);

    try {
      const since = new Date(now.getTime() - SLA_WINDOW_MS);
      const { rows, truncated: windowTruncated, error: queryError } =
        await fetchConnectionHealthLogs({
          sinceISO: since.toISOString(),
          limit: HEALTH_LOGS_LIMIT,
        });

      // Resposta atrasada (ou desmontagem): descarta sem tocar no estado, para
      // a requisição mais nova continuar dona do `loading`/dos dados.
      if (requestId !== requestRef.current || !mountedRef.current) return;

      if (queryError) {
        setError(queryError);
        return;
      }

      const aggregate = aggregateConnectionHealth(rows, now);
      setTruncated(windowTruncated);
      setUptime(aggregate.uptime);
      setIncidents(aggregate.incidents);
      setActiveAlerts(aggregate.activeAlerts);
      setError(null);
      setLastUpdated(now);
    } catch (err) {
      if (requestId === requestRef.current && mountedRef.current) {
        log.error(CONNECTION_HEALTH_LOAD_ERROR, err);
        setError(CONNECTION_HEALTH_LOAD_ERROR);
      }
    } finally {
      if (requestId === requestRef.current && mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    void refresh();
  }, [refresh]);

  return {
    uptime,
    incidents,
    activeAlerts,
    loading,
    error,
    truncated,
    lastUpdated,
    refresh,
  };
}
