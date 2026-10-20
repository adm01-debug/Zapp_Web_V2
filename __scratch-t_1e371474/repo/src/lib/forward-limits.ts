/**
 * Limites de protecao do encaminhamento em lote (etapa 39).
 *
 * Regra do plano: no maximo 10 destinos x 10 arquivos por operacao (100 envios). Acima
 * disso a acao fica desabilitada com o motivo visivel; a partir de 20 envios o operador
 * confirma explicitamente antes de disparar. Os dois limiares vivem aqui, puros e
 * testaveis, para a barra contextual e o dialogo usarem a MESMA conta.
 */

export const FORWARD_MAX_ITEMS = 10;
export const FORWARD_MAX_TARGETS = 10;
export const FORWARD_MAX_SENDS = FORWARD_MAX_ITEMS * FORWARD_MAX_TARGETS;
export const FORWARD_CONFIRM_THRESHOLD = 20;

/** Total de envios de uma operacao = arquivos x destinos. */
export function forwardSendCount(itemCount: number, targetCount: number): number {
  const items = Math.max(0, Math.floor(itemCount));
  const targets = Math.max(0, Math.floor(targetCount));
  return items * targets;
}

/**
 * Motivo pelo qual a operacao excede o limite (ou `null` quando esta dentro). O texto e
 * exibido ao operador; o consumidor usa a mera presenca para desabilitar o botao.
 */
export function forwardLimitError(itemCount: number, targetCount: number): string | null {
  if (itemCount > FORWARD_MAX_ITEMS) {
    return `Máximo de ${FORWARD_MAX_ITEMS} arquivos por operação (você selecionou ${itemCount}).`;
  }
  if (targetCount > FORWARD_MAX_TARGETS) {
    return `Máximo de ${FORWARD_MAX_TARGETS} destinos por operação (você selecionou ${targetCount}).`;
  }
  const sends = forwardSendCount(itemCount, targetCount);
  if (sends > FORWARD_MAX_SENDS) {
    return `Máximo de ${FORWARD_MAX_SENDS} envios por operação (${itemCount} × ${targetCount} = ${sends}).`;
  }
  return null;
}

/** A partir de 20 envios a operacao pede confirmacao explicita. */
export function needsForwardConfirmation(itemCount: number, targetCount: number): boolean {
  return forwardSendCount(itemCount, targetCount) >= FORWARD_CONFIRM_THRESHOLD;
}

/** Texto de confirmacao: "Vai enviar 40 mensagens para 4 contatos. Continuar?" */
export function forwardConfirmMessage(itemCount: number, targetCount: number): string {
  const sends = forwardSendCount(itemCount, targetCount);
  const contatos = targetCount === 1 ? 'contato' : 'contatos';
  return `Vai enviar ${sends} mensagens para ${targetCount} ${contatos}. Continuar?`;
}
