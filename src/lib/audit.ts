import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('Audit');

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
  | 'client_error';

interface AuditLogParams {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export async function logAudit({ action, entityType, entityId, details }: AuditLogParams) {
  try {
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      // args opcionais com DEFAULT NULL no SQL: passar undefined omite a chave
      // no body e o Postgres aplica o default. 'null' nao tipa contra 'string?'.
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_details: details ? JSON.parse(JSON.stringify(details)) : null,
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
