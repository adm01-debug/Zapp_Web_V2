/**
 * Substituto de `Math.random()` para as edge functions (Deno). Espelha
 * `src/lib/secureRandom.ts`, mas fica aqui porque o runtime e o bundler das
 * functions sao outros. Mantido minimo de proposito: so o que as functions
 * usavam (float em [0,1) para jitter de retry / desempate) — `Math.random()`
 * e previsivel e o Sonar marca todos os usos (S2245).
 */
export function secureRandomFloat(): number {
  // 53 bits uniformes (mesma construcao de genrand_res53), combinados por multiplicacao
  // por potencia de dois: sem divisao nem arredondamento sobre a saida criptografica,
  // entao nao ha vies (js/biased-cryptographic-random) e o resultado e sempre < 1.
  const [alto, baixo] = crypto.getRandomValues(new Uint32Array(2));
  return ((alto >>> 5) * 2 ** 26 + (baixo >>> 6)) * 2 ** -53;
}
