// Redação de PII e segredos para tudo que sai do sistema em log/auditoria.
//
// Mensagens de erro do PostgREST, da Edge e de terceiros às vezes carregam
// e-mail, telefone BR, JWT e chaves de API. Nada disso pode ser gravado em
// `audit_logs` nem impresso no console do navegador. Este módulo concentra a
// redação e é usado pelo `errorReporter` e pelo `logger`.

export const EMAIL_REDACTED = '[EMAIL_REDACTED]';
export const PHONE_REDACTED = '[TELEFONE_REDACTED]';
export const SECRET_REDACTED = '[SEGREDO_REDACTED]';

// Chaves cujo VALOR inteiro é segredo (independente do formato).
const SENSITIVE_KEYS = new Set([
  'password',
  'senha',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'refresh_token',
  'auth_token',
  'private_key',
  'authorization',
  'cookie',
]);

// E-mail simples (evita tratar `@` solto ou domínio sem TLD).
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Telefone BR: (11) 91234-5678, 11 91234-5678, +55 11 91234-5678, 11912345678,
// 1134567890 — DDD + 8/9 dígitos, separadores opcionais.
const PHONE_RE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;

// JWT (header base64 de `{"` começa sempre com `eyJ`).
const JWT_RE = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

// `chave=valor` / `chave: valor` — preserva o nome da chave, redige o valor.
const KEY_VALUE_RE =
  /\b(apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|password|senha|authorization|bearer)\b(\s*[:=]\s*)(?:Bearer\s+)?["']?([^\s"',;&)]+)["']?/gi;

// Segredo longo solto (base64/hex/url-safe) sem contexto de chave.
const LONG_SECRET_RE = /\b[A-Za-z0-9+/=._-]{40,}\b/g;

/** Redige PII e segredos de uma string. Texto sem PII volta inalterado. */
export function redactPII(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;

  return text
    .replace(KEY_VALUE_RE, (_m, key: string, sep: string) => `${key}${sep}${SECRET_REDACTED}`)
    .replace(JWT_RE, SECRET_REDACTED)
    .replace(LONG_SECRET_RE, SECRET_REDACTED)
    .replace(EMAIL_RE, EMAIL_REDACTED)
    .replace(PHONE_RE, PHONE_REDACTED);
}

/**
 * Redige recursivamente um valor qualquer (objeto/array/string) para uso em
 * `details` e nos argumentos do logger. Chaves sensíveis têm o valor trocado
 * por inteiro; strings aninhadas passam por `redactPII`.
 */
export function redactPIIValue(value: unknown, seen?: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactPII(value);
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactPII(value.message),
      stack: value.stack ? redactPII(value.stack) : undefined,
    };
  }

  const visited = seen ?? new WeakSet<object>();
  if (visited.has(value)) return '[CICLO_REDACTED]';
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactPIIValue(item, visited));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? SECRET_REDACTED
      : redactPIIValue(val, visited);
  }
  return out;
}
