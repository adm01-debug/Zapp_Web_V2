/**
 * Resposta `notSupported` da Edge `evolution-api`: a ação existe na Evolution
 * v2, mas não na Evolution GO (o provedor padrão). `callApi` sobe isso como
 * erro com `notSupported: true` e a mensagem técnica da Edge (que cita o nome
 * da rota). A tela troca essa mensagem por um aviso em português, sem nome de
 * rota, e trata como "recurso indisponível" — não como falha.
 */
export function isEvolutionNotSupported(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { notSupported?: unknown }).notSupported === true;
}

/** Aviso amigável: "<recurso> não está disponível nesta conexão do WhatsApp (Evolution GO)." */
export function mensagemNaoSuportado(recurso: string): string {
  return `${recurso} não está disponível nesta conexão do WhatsApp (Evolution GO).`;
}
