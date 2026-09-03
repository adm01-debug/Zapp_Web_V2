// Error reporting de produção sem serviço externo: erros de runtime viram
// linhas em audit_logs (action 'client_error') via a RPC log_audit_event já
// existente — INSERT direto é bloqueado por RLS, leitura é admin-only, e o
// logAudit é silent-fail por design (reportar erro nunca pode gerar erro).
// Anônimo (tela de Auth) não reporta: a RPC exige auth.uid().
import { logAudit } from '@/lib/audit';
import { getSessionId } from '@/lib/logger';

// Global injetado pelo define do Vite; ausente em jsdom/vitest — o typeof
// guard evita ReferenceError em qualquer teste que importe os boundaries.
declare const __ZAPP_BUILD_ID__: string | undefined;
const BUILD_ID = typeof __ZAPP_BUILD_ID__ === 'string' ? __ZAPP_BUILD_ID__ : 'unknown';

const MAX_REPORTS_PER_SESSION = 10;
const MIN_INTERVAL_MS = 5_000;
const MAX_FIELD_LEN = 2_000;

let reportCount = 0;
let lastReportAt = Number.NEGATIVE_INFINITY;
const seen = new Set<string>();

function fingerprint(message: string, source?: string): string {
  return `${message.slice(0, 200)}|${source ?? ''}`;
}

// Um crash-loop não pode virar flood no banco: dedupe por fingerprint,
// intervalo mínimo entre envios e teto por sessão de aba.
export function shouldReport(message: string, source?: string, now = Date.now()): boolean {
  if (reportCount >= MAX_REPORTS_PER_SESSION) return false;
  if (now - lastReportAt < MIN_INTERVAL_MS) return false;
  const fp = fingerprint(message, source);
  if (seen.has(fp)) return false;
  seen.add(fp);
  reportCount += 1;
  lastReportAt = now;
  return true;
}

export function resetErrorReporterForTests(): void {
  reportCount = 0;
  lastReportAt = Number.NEGATIVE_INFINITY;
  seen.clear();
}

interface ReportOptions {
  /** Ignora o gate de DEV (uso em testes). */
  force?: boolean;
}

export function reportClientError(
  error: unknown,
  context: Record<string, unknown> = {},
  opts?: ReportOptions
): void {
  if (import.meta.env.DEV && !opts?.force) return;
  const err = error instanceof Error ? error : new Error(String(error ?? 'unknown'));
  const message = err.message || 'unknown';
  const source = typeof context.source === 'string' ? context.source : undefined;
  if (!shouldReport(message, source)) return;
  void logAudit({
    action: 'client_error',
    details: {
      message: message.slice(0, MAX_FIELD_LEN),
      stack: (err.stack ?? '').slice(0, MAX_FIELD_LEN),
      path: window.location.pathname,
      buildId: BUILD_ID.slice(0, 12),
      sessionId: getSessionId(),
      ...context,
    },
  });
}
