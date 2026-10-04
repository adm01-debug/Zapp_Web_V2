export type EmailErrorKind = 'offline' | 'permission' | 'authentication' | 'rate-limit' | 'server' | 'unknown';

interface ErrorLike {
  name?: string;
  message?: string;
  status?: number;
  context?: { status?: number };
  kind?: EmailErrorKind;
  outcomeUnknown?: boolean;
}

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? error as ErrorLike : {};
}

export function classifyEmailError(error: unknown): EmailErrorKind {
  const candidate = asErrorLike(error);
  if (candidate.kind) return candidate.kind;
  const status = candidate.status ?? candidate.context?.status;
  const message = `${candidate.name || ''} ${candidate.message || String(error || '')}`.toLowerCase();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (candidate.name === 'FunctionsFetchError' || /offline|network|failed to fetch|fetch failed|load failed/.test(message)) return 'offline';
  if (status === 401 || /not authenticated|unauthenticated|jwt/.test(message)) return 'authentication';
  if (status === 403 || /forbidden|permission|sem permiss/.test(message)) return 'permission';
  if (status === 429 || /rate.?limit|too many requests/.test(message)) return 'rate-limit';
  if (candidate.name === 'FunctionsRelayError' || (typeof status === 'number' && status >= 500)) return 'server';
  return 'unknown';
}

export function isEmailOutcomeUnknown(error: unknown): boolean {
  const candidate = asErrorLike(error);
  if (candidate.outcomeUnknown === true) return true;
  const status = candidate.status ?? candidate.context?.status;
  return candidate.name === 'FunctionsFetchError'
    || candidate.name === 'FunctionsRelayError'
    || classifyEmailError(error) === 'offline'
    || status === 408
    || (typeof status === 'number' && status >= 500);
}

export function emailLoadErrorCopy(error: unknown): { title: string; description: string } {
  switch (classifyEmailError(error)) {
    case 'offline':
      return { title: 'Você está offline', description: 'Reconecte-se à internet e tente novamente. Nenhuma conta ou mensagem foi alterada.' };
    case 'permission':
      return { title: 'Acesso ao Email não autorizado', description: 'Sua sessão não possui permissão para acessar estes dados. Solicite acesso ao administrador.' };
    case 'authentication':
      return { title: 'Sessão expirada', description: 'Entre novamente para acessar suas contas de email com segurança.' };
    case 'rate-limit':
      return { title: 'Muitas solicitações', description: 'Aguarde alguns instantes antes de tentar novamente.' };
    default:
      return { title: 'Não foi possível carregar o Email', description: 'Sua sessão foi preservada. Tente novamente antes de reconectar a conta.' };
  }
}
