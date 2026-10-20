export type TimePeriod = '1h' | '6h' | '12h' | '24h' | '7d';

export const periodMs: Record<TimePeriod, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export const periodBuckets: Record<TimePeriod, number> = {
  '1h': 6, '6h': 6, '12h': 12, '24h': 24, '7d': 7,
};

export const HEALTHY_STATUSES = ['connected', 'healthy'];

/** Janela prometida pelo SLA de 24h (rótulo "Últimas 24 horas"). */
export const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Janela prometida pelo heatmap de disponibilidade de 7 dias. */
export const AVAILABILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Teto da consulta de health logs; acima dele a janela fica parcial. */
export const HEALTH_LOGS_LIMIT = 2000;

export interface DiagnosticResult {
  timestamp: string;
  diagnostics: Array<{
    instance: string;
    connectionState: string;
    webhookSeverity: string;
    webhookIssue?: string;
    webhook?: { url: string; eventsCount: number; missingCritical: string[]; urlCorrect: boolean };
    messageFlow?: { lastHour: { incoming: number; outgoing: number; total: number }; flowHealth: string };
    autoFix?: { applied: boolean };
  }>;
  overallHealth: { score: number; status: string };
}

export interface ConnectionInfo {
  id: string;
  instance_id: string;
  phone_number: string | null;
  status: string;
  health_status: string | null;
  health_response_ms: number | null;
  last_health_check: string | null;
  updated_at: string;
}

export interface HealthLog {
  id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface MessageStats {
  incoming: number;
  outgoing: number;
  total: number;
  hourlyData: { hour: string; incoming: number; outgoing: number }[];
}

export interface WebhookTestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  latencyMs?: number;
}

export interface WebhookConfig {
  url?: string;
  events?: string[];
  configured: boolean;
}

export interface UptimeInfo {
  /** `null` = nenhum check na janela anunciada (dado insuficiente, nunca aprovação). */
  percentage: number | null;
  totalChecks: number;
  healthyChecks: number;
  lastDowntime: string | null;
}

export interface SparklineData {
  messages: number[];
  latency: number[];
  uptime: number[];
}

export interface InstanceUptime {
  instanceId: string;
  percentage: number;
  totalChecks: number;
  healthyChecks: number;
  avgLatency: number;
  lastError: string | null;
}
