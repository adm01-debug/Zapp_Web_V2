import { supabase } from '@/integrations/supabase/client';
import { classifyEmailError, isEmailOutcomeUnknown, type EmailErrorKind } from '@/lib/emailErrorState';

export class GmailFunctionError extends Error {
  readonly kind: EmailErrorKind;
  readonly status?: number;
  readonly outcomeUnknown: boolean;
  /**
   * `code` do corpo JSON da resposta de erro da função (ex.: `reauth_required`),
   * quando houver. O mesmo status HTTP pode significar coisas diferentes — o
   * `gmail-sync` usa 409 tanto para "sincronização já em andamento" quanto para
   * "reconecte a conta" (`GMAIL_REAUTH_HTTP_STATUS`); só o `code` separa os dois.
   */
  readonly code?: string;

  constructor(error: unknown, code?: string) {
    const candidate = error && typeof error === 'object' ? error as { message?: string; context?: { status?: number }; status?: number } : {};
    super(candidate.message || 'Falha ao executar a operação do Gmail.');
    this.name = 'GmailFunctionError';
    this.status = candidate.status ?? candidate.context?.status;
    this.kind = classifyEmailError(error);
    this.outcomeUnknown = isEmailOutcomeUnknown(error);
    this.code = code;
  }
}

/**
 * Lê o `code` do corpo JSON de um `FunctionsHttpError` (cujo `context` é a
 * `Response`). Nunca lança: corpo ausente, já consumido ou não-JSON = sem código.
 */
async function readErrorCode(error: unknown): Promise<string | undefined> {
  try {
    const context = (error as { context?: { clone?: () => { json?: () => Promise<unknown> } } } | null)?.context;
    const body = await context?.clone?.()?.json?.();
    const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

export async function callGmailFunction(functionName: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new GmailFunctionError(response.error, await readErrorCode(response.error));
  return response.data;
}
