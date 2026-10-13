/**
 * Conexoes com saude DEGRADADA — faixa global "Conexao X esta instavel"
 * (cartao "avisos globais de conexao degradada e de servidor fora do ar / restaurado").
 *
 * Fonte: `whatsapp_connections.health_status` = 'degraded' + recencia de
 * `last_health_check` (janela de 10 min). E o mesmo dado que a tela Conexoes
 * mostra em ConnectionCard; nao ha tela nova nem tabela nova.
 *
 * A checagem de saude roda por cron (Edge `connection-health-check`), entao basta
 * reler a cada 60 s: a faixa nasce e morre junto com a janela, sem relogio extra.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Janela de recencia da checagem (card: "health degradada nos ultimos 10 min").
 */
export const DEGRADED_WINDOW_MS = 10 * 60 * 1000;
/** Ritmo da releitura enquanto a tela vive. */
export const DEGRADED_POLL_MS = 60_000;

export interface DegradedConnectionRow {
  id: string;
  instance_id: string | null;
  health_status: string | null;
  last_health_check: string | null;
}

export interface DegradedConnection {
  id: string;
  /** Rotulo mostrado na faixa (instance_id, como na faixa de desconectadas). */
  label: string;
  /** Epoch ms da checagem que marcou 'degraded'. */
  lastHealthCheck: number;
}

/**
 * Regra pura: `health_status = 'degraded'` E checagem DENTRO da janela.
 * Sem `last_health_check` valido nao entra: nao da para provar a recencia.
 */
export function selectDegradedConnections(
  rows: readonly DegradedConnectionRow[],
  now: number,
  windowMs: number = DEGRADED_WINDOW_MS,
): DegradedConnection[] {
  const degraded: DegradedConnection[] = [];

  for (const row of rows) {
    if (row.health_status !== 'degraded') continue;
    const lastHealthCheck = row.last_health_check ? Date.parse(row.last_health_check) : Number.NaN;
    if (!Number.isFinite(lastHealthCheck)) continue;
    if (now - lastHealthCheck > windowMs) continue;
    degraded.push({
      id: row.id,
      label: row.instance_id || 'conexao',
      lastHealthCheck,
    });
  }

  return degraded;
}

/** Consulta minima: so as linhas degradadas, com os 4 campos que a faixa usa. */
export async function fetchDegradedConnections(now: number = Date.now()): Promise<DegradedConnection[]> {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('id, instance_id, health_status, last_health_check')
    .eq('health_status', 'degraded');

  if (error) throw new Error(error.message);

  return selectDegradedConnections((data ?? []) as DegradedConnectionRow[], now);
}

export interface DegradedConnectionsData {
  degraded: DegradedConnection[];
  loading: boolean;
  error: string | null;
}

export function useDegradedConnections(): DegradedConnectionsData {
  // react-query cuida do ciclo: primeira leitura na montagem e releitura a cada
  // minuto enquanto a tela vive (mesmo padrao de `useSystemHealthSignals`).
  const { data, isLoading, error } = useQuery({
    queryKey: ['degraded-connections'],
    queryFn: () => fetchDegradedConnections(),
    staleTime: DEGRADED_POLL_MS,
    refetchInterval: DEGRADED_POLL_MS,
  });

  return {
    degraded: data ?? [],
    loading: isLoading,
    error: error ? error.message : null,
  };
}
