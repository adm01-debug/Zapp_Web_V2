/**
 * Substituto de `Math.random()` para as edge functions (Deno). Espelha
 * `src/lib/secureRandom.ts`, mas fica aqui porque o runtime e o bundler das
 * functions sao outros. Mantido minimo de proposito: so o que as functions
 * usavam (float em [0,1) para jitter de retry / desempate) — `Math.random()`
 * e previsivel e o Sonar marca todos os usos (S2245).
 */
export function secureRandomFloat(): number {
  // lgtm[js/biased-cryptographic-random] codeql[js/biased-cryptographic-random]
  // -- W81: viés máximo de 1 ULP (float64); aceitável para jitter/desempate.
  // Não é chave criptográfica — o uso é Math.random() drop-in (S2245).
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
