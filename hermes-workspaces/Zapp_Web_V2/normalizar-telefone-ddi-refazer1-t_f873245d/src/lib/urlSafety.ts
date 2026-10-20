/**
 * Guard de URL para valores que viram `href` vindos de dados externos
 * (CRM/Singu). Aceita apenas http(s) absoluto — nunca renderizar URL que não
 * passe aqui (javascript:, data:, vbscript:, protocol-relative, etc.).
 */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * SEC-FRONTEND-02 (auditoria de 07/10/2026): o `href` das seções do painel 360 aceitava
 * qualquer esquema vindo do CRM externo — o valor cru (`javascript:`, `data:`) chegava
 * ao DOM sem nenhum guard do app. Aqui a lista é fechada e pequena de propósito:
 * http(s) e os dois esquemas legítimos de um link de contato (`mailto:`, `tel:`).
 * `javascript:`, `data:`, `vbscript:`, URL relativa e protocol-relative (`//host`)
 * continuam barrados. Para `src` de imagem use `isSafeHttpUrl` (só http/https).
 */
const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function isSafeExternalHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    return SAFE_HREF_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

