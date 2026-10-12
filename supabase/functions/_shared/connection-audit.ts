/**
 * Trilha de auditoria das ações de conexão do WhatsApp (paridade V3 → V2,
 * 12/10/2026).
 *
 * Defeito que este módulo fecha: só a exclusão de conexão (`delete-instance`)
 * deixava rastro em `audit_logs`. `create-connection`, `connect` (QR),
 * `disconnect` e a recriação destrutiva de sessão órfã na Evolution GO não
 * registravam QUEM fez — a tela de trilha (CA2) prometia esses registros e eles
 * não existiam.
 *
 * Formato único: a exclusão passou a usar este mesmo helper, para não haver dois
 * formatos de linha de trilha. `entity_type` é sempre `connection` e o
 * `instance_id` textual (não é uuid) segue em `details`, junto do nome da
 * conexão e do flavor (`go`/`v2`) — nunca número, token ou QR Code.
 *
 * Regra de ouro: falha de auditoria NUNCA bloqueia (nem mascara) a ação
 * auditada. O efeito no provedor/banco já aconteceu; devolver erro ao operador
 * faria parecer que a ação falhou. Aqui só se registra o erro de forma
 * estruturada e a ação segue.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { Logger } from "./validation.ts";

export interface ConnectionAuditEntry {
  /** Ator da ação (auth.users.id) — vem de `callerClient.auth.getUser()`. */
  userId: string | null;
  /** Ação da trilha (ex.: `connection_created`, `connection_connect`). */
  action: string;
  /** Tipo da entidade auditada; padrão `connection`. */
  entityType?: string | null;
  /** UUID da linha `whatsapp_connections` quando conhecido (o instance_id
   *  textual vai em `details`, que é jsonb). */
  entityId?: string | null;
  /** Contexto da ação. NUNCA incluir número, token ou QR Code. */
  details?: Record<string, unknown>;
  /** IP de quem chamou (`getClientIP(req)`). */
  ipAddress?: string | null;
  /** User-Agent do navegador, quando presente. */
  userAgent?: string | null;
}

/**
 * Grava uma linha em `audit_logs` (client service-role). Nunca lança: qualquer
 * erro do PostgREST é capturado e logado, mantendo a ação auditada intacta.
 */
export async function writeConnectionAuditLog(
  supabase: SupabaseClient,
  entry: ConnectionAuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? "connection",
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) throw error;
  } catch (err) {
    new Logger("evolution-api").error("Falha ao gravar trilha de auditoria de conexão", {
      action: entry.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
