/**
 * Retentável é só o erro que uma segunda tentativa pode resolver.
 *
 * `aborted` saiu da lista: quem aborta é o próprio app (comando de voz substituído
 * ou timeout de 15 s do `processTranscript`) — o chamador já descartou a resposta, e
 * repetir só gasta os timers do backoff. `429` também saiu: insistir agrava o limite
 * de taxa em vez de contorná-lo; a orientação ao operador fica no `friendlyErrorMessage`.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch') ||
      msg.includes('500') ||
      msg.includes('503')
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
    // Permissão de microfone é o erro REAL da captura (`getUserMedia`), cujo
    // DOMException tem nome `NotAllowedError`. Um 'permission denied' genérico (403
    // do servidor, RLS) NÃO pode virar orientação de microfone: o operador iria mexer
    // nas configurações do navegador por um problema que não é dele.
    if (error.name === 'NotAllowedError' || msg.includes('notallowed') || msg.includes('microphone'))
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
