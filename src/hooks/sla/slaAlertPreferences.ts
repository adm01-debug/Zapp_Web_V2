/**
 * Preferências de alerta de SLA (`sla_alert_preferences`) — contrato puro.
 *
 * A linha é por usuário. Sem linha valem os defaults da própria tabela (tudo ligado): usuário novo
 * tem de ser avisado como sempre foi. `enabled` é o desligamento geral — desligado, nenhum aviso sai,
 * independentemente dos controles filhos.
 */

/** Prazo que o alerta vigia (mesmos valores de `sla_alert_events.alert_type`). */
export type SlaAlertType = 'first_response' | 'resolution';

/** `warning` = perto do limite; `breached` = prazo estourado (`sla_alert_events.severity`). */
export type SlaAlertSeverity = 'warning' | 'breached';

export interface SlaAlertPreferences {
  enabled: boolean;
  alertFirstResponse: boolean;
  alertResolution: boolean;
  severityWarning: boolean;
  severityBreached: boolean;
}

/** Defaults da tabela: `enabled`, `alert_first_response`, `alert_resolution` e as duas severidades. */
export const DEFAULT_SLA_ALERT_PREFERENCES: SlaAlertPreferences = Object.freeze({
  enabled: true,
  alertFirstResponse: true,
  alertResolution: true,
  severityWarning: true,
  severityBreached: true,
});

/** Colunas da tabela que o hook lê (snake_case do banco). */
export interface SlaAlertPreferenceRow {
  user_id?: string | null;
  enabled?: boolean | null;
  alert_first_response?: boolean | null;
  alert_resolution?: boolean | null;
  severity_warning?: boolean | null;
  severity_breached?: boolean | null;
}

export const SLA_ALERT_TYPE_LABELS: Record<SlaAlertType, string> = {
  first_response: 'Primeira resposta',
  resolution: 'Resolução',
};

export const SLA_ALERT_SEVERITY_LABELS: Record<SlaAlertSeverity, string> = {
  warning: 'Em risco',
  breached: 'Violado',
};

export const SLA_ALERT_TYPES: readonly SlaAlertType[] = ['first_response', 'resolution'];
export const SLA_ALERT_SEVERITIES: readonly SlaAlertSeverity[] = ['warning', 'breached'];

export function isSlaAlertType(value: unknown): value is SlaAlertType {
  return value === 'first_response' || value === 'resolution';
}

export function isSlaAlertSeverity(value: unknown): value is SlaAlertSeverity {
  return value === 'warning' || value === 'breached';
}

/** Coluna booleana da tabela: só `false` desliga; ausente/nulo cai no default. */
function comoBooleano(valor: boolean | null | undefined, padrao: boolean): boolean {
  return typeof valor === 'boolean' ? valor : padrao;
}

/** Linha do banco → preferências. Linha ausente (usuário novo) devolve o default da tabela. */
export function normalizeSlaAlertPreferences(
  row?: SlaAlertPreferenceRow | null,
): SlaAlertPreferences {
  if (!row) return { ...DEFAULT_SLA_ALERT_PREFERENCES };
  return {
    enabled: comoBooleano(row.enabled, DEFAULT_SLA_ALERT_PREFERENCES.enabled),
    alertFirstResponse: comoBooleano(
      row.alert_first_response,
      DEFAULT_SLA_ALERT_PREFERENCES.alertFirstResponse,
    ),
    alertResolution: comoBooleano(
      row.alert_resolution,
      DEFAULT_SLA_ALERT_PREFERENCES.alertResolution,
    ),
    severityWarning: comoBooleano(
      row.severity_warning,
      DEFAULT_SLA_ALERT_PREFERENCES.severityWarning,
    ),
    severityBreached: comoBooleano(
      row.severity_breached,
      DEFAULT_SLA_ALERT_PREFERENCES.severityBreached,
    ),
  };
}

/**
 * O aviso deste tipo/severidade pode sair para este usuário?
 *
 * `enabled` desligado fecha tudo (é o "não quero ser avisado"); depois o tipo (primeira resposta x
 * resolução) e a severidade (risco x violação) precisam estar ligados.
 */
export function slaAlertAllowed(
  preferences: SlaAlertPreferences,
  alert: { type: SlaAlertType; severity: SlaAlertSeverity },
): boolean {
  const prefs = preferences ?? DEFAULT_SLA_ALERT_PREFERENCES;
  if (!prefs.enabled) return false;
  const tipoLigado = alert.type === 'first_response' ? prefs.alertFirstResponse : prefs.alertResolution;
  if (!tipoLigado) return false;
  return alert.severity === 'warning' ? prefs.severityWarning : prefs.severityBreached;
}
