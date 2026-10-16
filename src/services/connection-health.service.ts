import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConnectionHealthService');

/** Linha de `connection_health_logs` usada na derivação. */
export interface HealthLogRow {
  id: string;
  connection_id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

const SELECT_COLUMNS =
  'id, connection_id, instance_id, status, response_time_ms, error_message, checked_at';

export const CONNECTION_HEALTH_LOAD_ERROR =
  'Não foi possível carregar o histórico de saúde das conexões.';

export interface FetchConnectionHealthLogsParams {
  /** Início da janela (ISO). */
  sinceISO: string;
  /** Teto de linhas da consulta; acima dele a janela fica parcial. */
  limit: number;
}

export interface ConnectionHealthLogsResult {
  rows: HealthLogRow[];
  /** `true` quando a consulta bateu o teto (`rows.length >= limit`). */
  truncated: boolean;
  error: string | null;
}

/**
 * Único ponto que fala com `connection_health_logs`. A consulta é LIMITADA e
 * ORDENADA (mais recentes primeiro, desempate por `id`) para não varrer a
 * tabela; a camada de apresentação (`src/components/**`) não importa o client
 * do Supabase, então o acesso a dados vive aqui, em `src/services`.
 */
export async function fetchConnectionHealthLogs(
  params: FetchConnectionHealthLogsParams,
): Promise<ConnectionHealthLogsResult> {
  try {
    const { data, error } = await supabase
      .from('connection_health_logs')
      .select(SELECT_COLUMNS)
      .gte('checked_at', params.sinceISO)
      .order('checked_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit);

    if (error) {
      log.error(CONNECTION_HEALTH_LOAD_ERROR, error);
      return { rows: [], truncated: false, error: CONNECTION_HEALTH_LOAD_ERROR };
    }

    const rows = (data ?? []) as HealthLogRow[];
    return { rows, truncated: rows.length >= params.limit, error: null };
  } catch (err) {
    log.error(CONNECTION_HEALTH_LOAD_ERROR, err);
    return { rows: [], truncated: false, error: CONNECTION_HEALTH_LOAD_ERROR };
  }
}
