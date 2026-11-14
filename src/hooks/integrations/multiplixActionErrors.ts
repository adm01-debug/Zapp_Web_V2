/**
 * Texto em PT-BR das falhas das ACOES do Multiplix (iniciar, retomar, pausar,
 * cancelar, confirmar).
 *
 * O worker `multiplix-send` responde a recusa do banco com o codigo seguro do
 * `safeDbErrorCode` (ex.: `multiplix_dispatch_already_running`, ou o SQLSTATE
 * `55000` quando a mensagem nao e um codigo) e a edge `multiplix-dispatch`
 * devolve codigos nomeados do `confirm`. Nenhum desses codigos pode chegar cru
 * ao toast: o operador nao sabe o que fazer com "multiplix_dispatch_start_denied_from_cancelled".
 */
import { EDGE_ERROR_NETWORK } from '@/lib/invokeEdge';

/**
 * Erro nomeado das acoes do worker `multiplix-send` (`start`/`pause`/`cancel`).
 * `code` e o `error` do corpo (codigo seguro do banco ou texto fixo da edge);
 * `message` NUNCA vai para a tela — quem mostra usa `multiplixActionErrorText`.
 */
export class MultiplixSendError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, message?: string, status: number | null = null) {
    super(message ?? code);
    this.name = 'MultiplixSendError';
    this.code = code;
    this.status = status;
  }
}

/** `start` fora da janela de envio: o worker responde 200 com `{ ok: false }`. */
export const MULTIPLIX_OUTSIDE_WINDOW = 'multiplix_outside_window';

/** F49: bloqueios da revalidacao do `confirm` (o que o operador precisa corrigir). */
export const MULTIPLIX_CONFIRM_BLOCKERS: Record<string, string> = {
  multiplix_confirm_no_recipients: 'o disparo ficou sem destinatário',
  multiplix_confirm_no_eligible_recipients: 'nenhum destinatário está apto a receber',
  multiplix_confirm_no_blocks: 'o disparo ainda não tem bloco de mensagem',
  multiplix_confirm_connection_required: 'o disparo não tem conexão de envio definida',
  multiplix_confirm_connection_unavailable: 'a conexão de envio do disparo está desconectada',
};

const EXACT_TEXT: Record<string, string> = {
  multiplix_dispatch_already_running: 'Este disparo já está enviando. Aguarde alguns instantes e atualize a tela.',
  multiplix_dispatch_confirm_required:
    'Este disparo ainda não tem fila de envio. Use “Iniciar” e confirme para gerar a fila e começar o envio.',
  multiplix_dispatch_message_required: 'O disparo está sem mensagem. Escreva o texto antes de iniciar.',
  multiplix_dispatch_recipients_required: 'O disparo está sem destinatários.',
  multiplix_dispatch_not_found: 'O disparo não foi encontrado. Ele pode ter sido removido.',
  'Dispatch not found': 'O disparo não foi encontrado. Ele pode ter sido removido.',
  multiplix_dispatch_scope_denied: 'Você não tem permissão para controlar este disparo.',
  Forbidden: 'Você não tem permissão para controlar este disparo.',
  Unauthorized: 'Sua sessão expirou. Entre novamente e tente de novo.',
  'Not authenticated': 'Sua sessão expirou. Entre novamente e tente de novo.',
  'WhatsApp connection lost: dispatch paused':
    'A conexão do WhatsApp está desconectada; o disparo continua pausado. Reconecte e tente de novo.',
  [MULTIPLIX_OUTSIDE_WINDOW]: 'Fora da janela de envio do disparo. Tente de novo dentro do horário configurado.',
  multiplix_dispatch_review_stale: 'O disparo mudou desde que a tela foi aberta. Atualize e confirme de novo.',
  multiplix_dispatch_already_confirmed: 'Este disparo já foi confirmado.',
  multiplix_dispatch_not_confirmable: 'Este disparo não pode mais ser iniciado no estado atual.',
  multiplix_over_recipient_limit: 'O disparo passou do teto de destinatários.',
  rate_limited: 'Muitos pedidos seguidos. Aguarde alguns instantes e tente de novo.',
  [EDGE_ERROR_NETWORK]: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
};

const PREFIX_TEXT: Array<[string, string]> = [
  ['multiplix_dispatch_start_denied_from_', 'Este disparo não pode ser iniciado no estado atual.'],
  ['multiplix_dispatch_pause_denied_from_', 'Só é possível pausar um disparo que está enviando.'],
  ['multiplix_dispatch_cancel_denied_from_', 'Este disparo já foi encerrado e não pode ser cancelado.'],
];

/** Codigo de uma falha de acao (worker ou edge de dominio), quando ha um. */
export function multiplixActionErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}

/**
 * Texto para o toast. Codigo conhecido vira frase; codigo desconhecido (SQLSTATE,
 * `transition_failed`, erro de rede sem corpo) vira o `fallback` — nunca o codigo
 * cru nem a mensagem tecnica do SDK.
 */
export function multiplixActionErrorText(error: unknown, fallback: string): string {
  const code = multiplixActionErrorCode(error)
    ?? (error instanceof Error && error.message === 'Not authenticated' ? 'Not authenticated' : null);
  if (!code) return fallback;
  const blocker = MULTIPLIX_CONFIRM_BLOCKERS[code];
  if (blocker) return `Não foi possível iniciar: ${blocker}.`;
  const exact = EXACT_TEXT[code];
  if (exact) return exact;
  const prefixed = PREFIX_TEXT.find(([prefix]) => code.startsWith(prefix));
  if (prefixed) return prefixed[1];
  return fallback;
}
