export interface TelemetryRow {
  id: string;
  operation: string;
  table_name: string | null;
  rpc_name: string | null;
  duration_ms: number;
  record_count: number | null;
  query_limit: number | null;
  query_offset: number | null;
  count_mode: string | null;
  severity: string;
  error_message: string | null;
  user_id: string | null;
  created_at: string;
}

export type SeverityFilter = "all" | "slow" | "very_slow" | "error";
export type TimeFilter = "1h" | "6h" | "24h" | "7d" | "custom";
