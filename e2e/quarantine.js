/**
 * Quarentena formal da suite E2E. Cada item admite um spec que sabemos estar
 * quebrado por motivo CONHECIDO e com prazo para voltar. O playwright.config.ts
 * le este arquivo e aplica testIgnore nos specs listados; scripts/ci/check-quarantine.mjs
 * falha quando o prazo vence.
 *
 * Uma quarentena sem prazo e' um `skip` com outro nome: ninguem revisa, o motivo
 * se perde e o teste nunca volta. Aqui o item carrega motivo e issue, entao a
 * quarentena tem dono e tem fim.
 *
 * Campos obrigatorios por item:
 *   spec  - caminho do spec, relativo a raiz do repositorio (ex: e2e/location-picker.spec.ts)
 *   motivo - por que este spec esta em quarentena, em uma frase
 *   issue - numero da issue do GitHub que acompanha a volta do teste
 *   prazo - data ISO (AAAA-MM-DD) ate quando a quarentena vale. Passou do prazo, o verificador falha.
 *
 * Se a lista esta vazia: Correto. Nenhum spec merece quarentena hoje. A estrutura existe
 * para quando precisar, e o verificador roda contra ela de qualquer forma -- e' o que
 * garante que a regra nao apodrece sem ninguem notar.
 */

export const quarentena = [];
