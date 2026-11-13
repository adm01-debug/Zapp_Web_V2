/**
 * Conexão de envio — regras compartilhadas pelo front (auditoria Conversas
 * 2026-11-13, P0-1).
 *
 * 1. A conexão de TESTE do E2E ("[E2E] Conexão WhatsApp Teste", instance_id
 *    `E2E_FIXTURE`) nunca é candidata a envio: ela não existe no provedor e, quando
 *    estava `connected` em produção, recebia mensagens reais de atendentes que
 *    nunca chegavam ao cliente. O banco aplica a mesma regra
 *    (`resolve_outbound_whatsapp_connection`, migration 20261113130000).
 * 2. Quando a conexão do contato caiu, o envio NÃO troca de número em silêncio: a
 *    RPC recusa com `contact_whatsapp_connection_disconnected` e a tela diz
 *    "WhatsApp desconectado".
 */

export const E2E_FIXTURE_INSTANCE_ID = 'E2E_FIXTURE';
const E2E_NAME_PREFIX = '[E2E]';

export interface ConnectionIdentity {
  instance_id?: string | null;
  name?: string | null;
}

/** true para a conexão de teste do E2E (pelo instance_id ou pelo nome "[E2E]…"). */
export function isTestFixtureConnection(connection: ConnectionIdentity | null | undefined): boolean {
  if (!connection) return false;
  if (connection.instance_id === E2E_FIXTURE_INSTANCE_ID) return true;
  return typeof connection.name === 'string' && connection.name.trimStart().startsWith(E2E_NAME_PREFIX);
}

/** Remove a conexão de teste de uma lista de candidatas a envio. */
export function withoutTestFixtureConnections<T extends ConnectionIdentity>(connections: readonly T[] | null | undefined): T[] {
  return (connections ?? []).filter((connection) => !isTestFixtureConnection(connection));
}

export const WHATSAPP_DISCONNECTED_TITLE = 'WhatsApp desconectado';
export const WHATSAPP_DISCONNECTED_DESCRIPTION =
  'A conexão do WhatsApp deste contato está fora do ar — a mensagem não foi enviada. Avise o admin para reconectar (novo QR Code).';
const NO_CONNECTION_DESCRIPTION =
  'Nenhuma conexão do WhatsApp está ativa — a mensagem não foi enviada. Avise o admin para reconectar (novo QR Code).';

const DISCONNECTED_CODES: Record<string, string> = {
  contact_whatsapp_connection_disconnected: WHATSAPP_DISCONNECTED_DESCRIPTION,
  no_connected_whatsapp_connection: NO_CONNECTION_DESCRIPTION,
  selected_whatsapp_connection_unavailable: WHATSAPP_DISCONNECTED_DESCRIPTION,
};

/**
 * Se o erro de envio é "sem conexão viva", devolve a descrição para o aviso
 * "WhatsApp desconectado"; senão `null` (o chamador mantém o aviso genérico).
 */
export function describeWhatsAppDisconnected(error: unknown): string | null {
  if (!error || typeof error !== 'object' && typeof error !== 'string') return null;
  const text = typeof error === 'string'
    ? error
    : [
      (error as { message?: unknown }).message,
      (error as { code?: unknown }).code,
      (error as { details?: unknown }).details,
    ].filter((part): part is string => typeof part === 'string').join(' ');
  for (const [code, description] of Object.entries(DISCONNECTED_CODES)) {
    if (text.includes(code)) return description;
  }
  return null;
}
