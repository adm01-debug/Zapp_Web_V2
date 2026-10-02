/**
 * F36 (Bloco D) — kernel de mensageria compartilhado entre `talkx-send` e `multiplix-send`.
 *
 * Objetivo do bloco: os dois edges param de ser dois codigos. Cada modulo abaixo e dono de
 * UMA responsabilidade e nao conhece os outros (composicao acontece na edge, nao aqui).
 *
 * Uso tipico numa edge:
 *
 *   import { personalize, normalizePhone, eligibility, prepareMedia, send, planRetry, newCorrelationId }
 *     de ../_shared/messaging/index.ts
 *
 * O caminho acima fica SEM aspas de proposito: o gerador do deployment-manifest
 * (scripts/edge-deploy/manifest-lib.mjs) le imports por regex e NAO distingue
 * comentario — um exemplo `from "../_shared/messaging/index.ts"` viraria um
 * import fantasma que nao resolve e derruba o `generate-manifest --check`
 * assim que uma edge passa a importar este index (F43).
 *
 * Regras do modulo:
 *   - funcoes puras onde da (eligibility, classify, personalize); I/O sempre injetavel
 *     (`deps.fetch` / `opts.fetch`), para o teste rodar sem rede;
 *   - nenhum modulo deste diretorio loga conteudo de mensagem ou dado de cliente;
 *   - o adaptador de provedor NAO classifica erro: quem chama passa status/body crus para
 *     `classifyProviderError` (F42) — separacao proposital, para a politica de retry ser
 *     testavel sem rede.
 */

import { secureRandomFloat } from "../secure-random.ts";

export * from "./types.ts";

export * from "./personalize.ts";
export * from "./phone.ts";
export * from "./eligibility.ts";
export * from "./media.ts";
export * from "./evolution-go.ts";
export * from "./errors.ts";
export * from "./timing.ts";

/**
 * Gera o identificador de correlacao de UMA requisicao (F43).
 *
 * Usa `crypto.randomUUID` quando disponivel (Deno sempre tem) e cai para um id de tempo +
 * aleatorio no caso contrario. Opaco de proposito: nao derive nada de dado de cliente.
 */
export function newCorrelationId(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === "function") return cripto.randomUUID();
  return `c-${Date.now().toString(36)}-${secureRandomFloat().toString(36).slice(2, 10)}`;
}
