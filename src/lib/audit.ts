import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('Audit');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true para UUID RFC 4122 (qualquer caixa); false para null, vazio, rota, JID, etc. */
export function isValidUUID(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

export type AuditAction = 
  | 'login'
  | 'logout'
  | 'message_sent'
  | 'message_received'
  | 'contact_created'
  | 'contact_updated'
  | 'connection_created'
  | 'connection_deleted'
  | 'call_started'
  | 'call_ended'
  | 'transfer'
  | 'settings_changed'
  | 'client_error'
  | 'searchbox_session'
  | 'searchbox_cost_guard'
  | 'searchbox_budget_warning'
  | 'searchbox_selected'
  | 'location_sent'
  | 'unauthorized_access';

interface AuditLogParams {
  action: AuditAction;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Separa o `entityId` num valor seguro para a coluna uuid + fallback textual nos
 * detalhes. Rota (`/painel`), JID do WhatsApp e e-mail NAO sao UUID: a coluna
 * `audit_logs.entity_id` e uuid e `log_audit_event` faz o cast do texto — valor
 * invalido vira NULL e a rota tentada se perde (`20261003272707...:1067-1075`).
 * Nao-UUID vira `null` na coluna e o texto original segue em
 * `details.entity_id_text`. Vazio/ausente nao inventa detalhe.
 */
export function normalizeEntityId(
  entityId: string | null | undefined,
  details?: Record<string, unknown>
): { entityId: string | null; details: Record<string, unknown> | null } {
  const trimmed = typeof entityId === 'string' ? entityId.trim() : '';
  if (!trimmed) return { entityId: null, details: details ?? null };
  if (isValidUUID(trimmed)) return { entityId: trimmed, details: details ?? null };
  return {
    entityId: null,
    details: { ...(details ?? {}), entity_id_text: trimmed },
  };
}

export async function logAudit({ action, entityType, entityId, details }: AuditLogParams) {
  try {
    const norm = normalizeEntityId(entityId, details);
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      // args opcionais com DEFAULT NULL no SQL: passar undefined omite a chave
      // no body e o Postgres aplica o default. 'null' nao tipa contra 'string?'.
      p_entity_type: entityType,
      // tipo gerado do RPC so aceita string: null vira chave omitida e o Postgres
      // aplica DEFAULT NULL — a coluna uuid fica NULL (mesmo efeito).
      p_entity_id: norm.entityId ?? undefined,
      p_details: norm.details ? JSON.parse(JSON.stringify(norm.details)) : null,
      p_user_agent: navigator.userAgent,
    });

    if (error) {
      log.warn('Failed to log audit:', error.message);
    }
  } catch (err: unknown) {
    // Silently fail - audit logging should never break the app
    log.warn('Audit log error:', err instanceof Error ? err.message : 'unknown');
  }
}
