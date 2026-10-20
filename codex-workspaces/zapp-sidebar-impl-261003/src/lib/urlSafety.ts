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
