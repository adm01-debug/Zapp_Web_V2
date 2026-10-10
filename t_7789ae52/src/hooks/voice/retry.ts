export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('aborted') ||
      msg.includes('fetch') ||
      msg.includes('500') ||
      msg.includes('503') ||
      msg.includes('429')
    );
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isRetryableError(error)) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('microphone') || msg.includes('permission') || msg.includes('notallowed'))
      return 'Permissão de microfone negada. Habilite nas configurações do navegador.';
    if (msg.includes('network') || msg.includes('fetch'))
      return 'Problema de conexão. Verifique sua internet.';
    if (msg.includes('timeout') || msg.includes('aborted'))
      return 'A operação demorou demais. Tente novamente.';
    if (msg.includes('429') || msg.includes('rate limit'))
      return 'Muitas solicitações. Aguarde um momento.';
    if (msg.includes('402') || msg.includes('credits'))
      return 'Créditos de IA esgotados.';
    if (msg.includes('401') || msg.includes('unauthorized'))
      return 'Sessão expirada. Faça login novamente.';
  }
  return 'Erro inesperado. Tente novamente.';
}
