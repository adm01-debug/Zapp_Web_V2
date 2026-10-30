/**
 * Tradução central de erros de acesso negado (RLS/PostgREST) para a interface.
 *
 * A mensagem crua do PostgREST vaza a estrutura do banco — por exemplo
 * `new row violates row-level security policy for table "contatos"` — e não
 * ajuda o operador. `describeAccessError` devolve SEMPRE o mesmo texto em pt-BR,
 * sem ecoar o original, para que nenhum nome de tabela ou de policy chegue à UI.
 */

/** Campos que interessam de um erro do PostgREST/Supabase. */
export interface AccessErrorShape {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
}

/** Códigos PostgREST/PostgreSQL de negação de acesso. */
const ACCESS_DENIED_CODES = new Set(['42501', 'PGRST301']);

/** Fragmentos de mensagem (em minúsculas) que indicam negação de acesso. */
const ACCESS_DENIED_FRAGMENTS = [
  'row-level security',
  'permission denied',
  'insufficient privilege',
  'forbidden',
];

/** Texto único de acesso negado — nunca cita tabela nem policy. */
export const ACCESS_DENIED_MESSAGE =
  'Acesso negado. Você não tem permissão para executar esta ação.';

function asShape(error: unknown): AccessErrorShape {
  return error && typeof error === 'object' ? (error as AccessErrorShape) : {};
}

/**
 * `true` quando o erro é uma negação de acesso: RLS `42501`, PostgREST
 * `PGRST301`, HTTP 403, ou a mensagem do próprio RLS (`row-level security`,
 * `permission denied`).
 */
export function isAccessDeniedError(error: unknown): boolean {
  const shape = asShape(error);

  const code = String(shape.code ?? '').trim();
  if (ACCESS_DENIED_CODES.has(code)) return true;

  const status = String(shape.status ?? shape.statusCode ?? '').trim();
  if (code === '403' || status === '403') return true;

  const message = String(shape.message ?? '').toLowerCase();
  return ACCESS_DENIED_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Mensagem pronta para a interface.
 *
 * Quando o acesso foi negado, devolve {@link ACCESS_DENIED_MESSAGE} — fixa, sem
 * vazar a tabela nem a policy. Para os demais erros devolve um texto genérico,
 * nunca a mensagem original, que poderia carregar estrutura do banco.
 */
export function describeAccessError(error: unknown): string {
  if (isAccessDeniedError(error)) return ACCESS_DENIED_MESSAGE;
  return 'Não foi possível concluir a ação. Tente novamente.';
}
