import { supabase } from '@/integrations/supabase/client';
import { classifyEmailError, isEmailOutcomeUnknown, type EmailErrorKind } from '@/lib/emailErrorState';

export class GmailFunctionError extends Error {
  readonly kind: EmailErrorKind;
  readonly status?: number;
  readonly outcomeUnknown: boolean;

  constructor(error: unknown) {
    const candidate = error && typeof error === 'object' ? error as { message?: string; context?: { status?: number }; status?: number } : {};
    super(candidate.message || 'Falha ao executar a operação do Gmail.');
    this.name = 'GmailFunctionError';
    this.status = candidate.status ?? candidate.context?.status;
    this.kind = classifyEmailError(error);
    this.outcomeUnknown = isEmailOutcomeUnknown(error);
  }
}

export async function callGmailFunction(functionName: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new GmailFunctionError(response.error);
  return response.data;
}
