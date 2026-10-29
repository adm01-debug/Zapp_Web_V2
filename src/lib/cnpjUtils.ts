/** Validação de CNPJ por dígito verificador (algoritmo padrão da Receita Federal). */

function calcCnpjDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Retorna true se `raw` é um CNPJ com dígitos verificadores válidos (aceita com ou sem máscara). */
export function isValidCnpj(raw: string): boolean {
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;
  // Sequências repetidas (00000000000000, 11111111111111, ...) passam no cálculo
  // de dígito verificador mas nunca são CNPJs reais.
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  const digits = cleaned.split('').map(Number);
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const digit1 = calcCnpjDigit(digits.slice(0, 12), firstWeights);
  if (digit1 !== digits[12]) return false;

  const digit2 = calcCnpjDigit(digits.slice(0, 13), secondWeights);
  return digit2 === digits[13];
}
