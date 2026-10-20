/**
 * Leitura e tradução das falhas da Edge `invite-user`.
 *
 * Vive fora do componente porque o arquivo do diálogo exporta só componentes
 * (regra `react-refresh/only-export-components` do lint do projeto).
 */

/** Lê o `status` e a mensagem do corpo que o `functions.invoke` devolve em não-2xx. */
export async function readInviteFailure(error: unknown): Promise<{ status: number | null; message: string | null }> {
  const context = (error as { context?: { status?: unknown; json?: () => Promise<unknown> } } | null)?.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  if (!context || typeof context.json !== 'function') return { status, message: null };
  try {
    const parsed = await context.json();
    if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
      return { status, message: (parsed as { error: string }).error };
    }
  } catch {
    // Corpo não-JSON (ex.: "Internal server error"): segue sem detalhe do servidor.
  }
  return { status, message: null };
}

/**
 * O `functions.invoke` devolve o `error` em resposta não-2xx e o corpo HTTP fica
 * em `error.context` (Response): sem ler esse corpo o diálogo não tem o código
 * nem a mensagem do servidor, e toda falha virava uma frase genérica.
 *
 * Traduz a falha do `invite-user` numa mensagem por causa, em pt-BR. O texto do
 * servidor tem prioridade quando já explica o motivo (ex.: 403 do papel do
 * chamador); os casos com resposta própria ganham frase fixa para não vazar
 * mensagem crua do GoTrue (em inglês) na tela.
 */
export function describeInviteError(status: number | null, serverMessage: string | null): string {
  const msg = (serverMessage ?? '').toLowerCase();

  if (/dom[ií]nio|domain/.test(msg)) {
    return 'Este domínio de e-mail não é confiável para convites.';
  }
  if (/already|registered|já cadastrad/.test(msg)) {
    return 'Este e-mail já está cadastrado.';
  }
  if (status === null) {
    return 'Não foi possível falar com o servidor. Confira a conexão e tente novamente.';
  }
  if (status === 401) {
    return 'Sua sessão expirou. Entre novamente para enviar o convite.';
  }
  if (status === 429) {
    return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.';
  }
  if (status === 403) {
    return serverMessage || 'Você não tem permissão para convidar com este papel.';
  }
  if (status >= 500) {
    return 'Não foi possível concluir o convite. Tente novamente em instantes.';
  }
  return serverMessage || 'Convite recusado. Confira o e-mail informado.';
}
