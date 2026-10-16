/** Faixa do controle de confiança mínima do Chatbot IA L1 (mesma do Slider). */
export const CONFIANCA_MIN = 30;
export const CONFIANCA_MAX = 95;
export const CONFIANCA_PADRAO = 60;

/**
 * Confiança fora da faixa do controle (30–95) não pode ser salva: volta ao
 * valor salvo atual da conexão e, se não houver nenhum válido, ao padrão 60.
 */
export function normalizarConfianca(valor: unknown, salva: unknown): number {
  const reserva =
    typeof salva === 'number' && salva >= CONFIANCA_MIN && salva <= CONFIANCA_MAX ? salva : CONFIANCA_PADRAO;
  return typeof valor === 'number' && valor >= CONFIANCA_MIN && valor <= CONFIANCA_MAX ? valor : reserva;
}
