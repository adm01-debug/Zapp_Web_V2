/**
 * Fonte unica de aleatoriedade segura para os lugares que usavam `Math.random()`.
 *
 * `Math.random()` nao e criptograficamente seguro: o gerador e reproduzivel a
 * partir de algumas saidas observadas. Em jitter de animacao isso nao custa nada,
 * mas o Sonar marca todos os usos (S2245) e a diferenca entre "enfeite visual" e
 * "codigo de backup de MFA" se perde no meio do caminho — entao os dois passam a
 * sair daqui, de uma implementacao so.
 *
 * `secureRandomFloat()` e substituto direto de `Math.random()`: mesmo intervalo
 * [0, 1), mesmo uso em expressoes como `Math.floor(secureRandomFloat() * n)`.
 */

/** Mesmo contrato de `Math.random()` (float em [0, 1)), com fonte criptografica. */
export function secureRandomFloat(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/**
 * Inteiro em [0, maxExclusive) sem vies de modulo: descarta a faixa incompleta
 * final em vez de tirar o resto direto (`valor % max`).
 */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('maxExclusive precisa ser um inteiro > 0');
  }
  const limite = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let valor = buffer[0];
  do {
    crypto.getRandomValues(buffer);
    valor = buffer[0];
  } while (valor >= limite);
  return valor % maxExclusive;
}

/** String de `tamanho` caracteres escolhidos (sem vies) do `alfabeto` informado. */
export function secureRandomChars(tamanho: number, alfabeto: string): string {
  if (!Number.isInteger(tamanho) || tamanho <= 0 || alfabeto.length === 0) {
    throw new RangeError('tamanho precisa ser inteiro > 0 e alfabeto nao pode ser vazio');
  }
  let saida = '';
  for (let i = 0; i < tamanho; i += 1) {
    saida += alfabeto[secureRandomInt(alfabeto.length)];
  }
  return saida;
}

/** Alfabeto base36 maiusculo — o mesmo conjunto que `Math.random().toString(36).toUpperCase()` produzia. */
export const BASE36_MAIUSCULO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
