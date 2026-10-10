// ─────────────────────────────────────────────────────────────────────────────
// messaging/eligibility.ts — kernel de ELEGIBILIDADE do Multiplix (Bloco D / F39).
//
// Função PURA `eligibility(recipient, ctx) -> { class, reason }`. Não faz I/O,
// não importa cliente nenhum (só o TIPO canônico do enum, apagado no runtime),
// não loga: recebe dados e devolve a decisão. É o ponto único onde `talkx-send`
// e `multiplix-send` (F43) vão decidir se um destinatário pode receber.
//
// A `class` é EXATAMENTE um dos 7 valores do enum `public.multiplix_eligibility`
// (F30), cuja fonte canônica no código é `../multiplix-eligibility.ts`
// (`MULTIPLIX_ELIGIBILITY_VALUES`) — importada, não redefinida, para não existir
// uma segunda lista que diverge em silêncio.
//
// `talkx_blacklist` NÃO é classe: é RAZÃO. Quem pediu descadastro cai na classe
// `suppressed` com `reason = 'talkx_blacklist'` (alinhado ao enum: `suppressed`
// é a classe; o motivo específico viaja no `reason`).
//
// ─── ORDEM DE PRECEDÊNCIA (e por quê) ────────────────────────────────────────
// A decisão é uma cascata: o PRIMEIRO bloqueio encontrado vence. A ordem vai do
// bloqueio mais DURÁVEL/INTRÍNSECO para o mais TRANSITÓRIO, de modo que
//   1. o operador sempre vê o motivo real (o durável), não um sintoma passageiro
//      ("conexão caiu" não pode esconder um opt-out permanente); e
//   2. condições que religam sozinhas (conexão, mídia) nunca mascararem uma
//      recusa que não deveria voltar atrás (descadastro, fora de escopo).
//
//   1) no_destination        — intrínseco. Sem destino endereçável, NADA mais é
//                              avaliável: blacklist e escopo casam pelo telefone,
//                              então "sem destino" tem de vir primeiro.
//   2) suppressed            — bloqueio legal/duro (opt-out). Precisa dominar
//                              qualquer condição transitória: religar a conexão
//                              não reabilita quem pediu para não receber.
//   3) out_of_scope          — decisão de POLÍTICA estável (quem a campanha pode
//                              alcançar). Domina o transitório para o operador ver
//                              por que a pessoa não é alvo, não um sintoma técnico.
//   4) connection_unavailable— TRANSPORTE do envio inteiro está fora. Mais amplo
//                              que a prontidão de um item; some sozinho depois.
//   5) media_pending         — prontidão do ITEM. Só é avaliável a partir do
//                              momento em que existe transporte.
//   6) requires_template     — RESERVADO (janela do WhatsApp: fora da janela de
//                              atendimento só cabe template aprovado). Último
//                              portão antes de elegível e INERTE por padrão:
//                              só dispara com sinal explícito do chamador, para
//                              nunca bloquear envio antes de a regra ser ligada.
//   7) eligible              — nenhum bloqueio.
//
// ─── SEMÂNTICA DAS ENTRADAS ──────────────────────────────────────────────────
// `recipient.destination` dá a EXISTÊNCIA do destino. `ctx.destinationValid`
// dá a VALIDADE (o resolvedor E.164 de F38 marca `false` quando a normalização
// recusa — ex.: possível LID). A ausência de `destinationValid` significa "não
// foi marcado como inválido", então um destino presente e não marcado segue;
// quem tem a heurística de E.164 é o chamador, não este kernel puro.
//
// O casamento da blacklist é por TELEFONE (dígitos): "+55 (11) 99999-8888" e
// "5511999998888" são o mesmo número. Variantes do 9º dígito são
// responsabilidade do resolvedor E.164 (F38) — aqui a comparação é exata em
// dígitos, para não casar um número por prefixo e suprimir quem não pediu.
// ─────────────────────────────────────────────────────────────────────────────

import type { MultiplixEligibility } from "../multiplix-eligibility.ts";

/** A classe devolvida é EXATAMENTE um valor do enum `multiplix_eligibility` (F30). */
export type EligibilityClass = MultiplixEligibility;

/**
 * Motivo específico dentro da classe. `eligible` é o único valor "positivo";
 * `talkx_blacklist` é a razão da classe `suppressed`. Mais de uma razão pode
 * mapear para a mesma classe no futuro (o `reason` é o detalhe auditável).
 */
export type EligibilityReason =
  | "eligible"
  | "missing_destination"
  | "invalid_destination"
  | "talkx_blacklist"
  | "out_of_scope"
  | "connection_unavailable"
  | "media_pending"
  | "requires_template";

/** O destinatário avaliado. `destination` é o telefone/destino cru (E.164 ou JID). */
export interface EligibilityRecipient {
  /** Destino (telefone). Ausente/vazio => `no_destination`. */
  destination?: string | null;
  /** Identificador do contato/empresa; reservado para correlação/escopo por id. */
  contactId?: string | null;
}

/**
 * Contexto que alimenta CADA classe. Todos os campos são opcionais: um campo
 * ausente significa "não há sinal de bloqueio", exceto `requiresTemplate` que é
 * RESERVADO e só bloqueia quando explicitamente `true`.
 */
export interface EligibilityContext {
  /** Telefones do `talkx_blacklist` (opt-out). Casados por dígitos. */
  blacklist?: readonly string[] | null;
  /** `false` => destino reputado inválido pelo resolvedor E.164 (F38). */
  destinationValid?: boolean;
  /** `false` => contato fora do escopo do público. */
  inScope?: boolean;
  /** `false` => conexão do WhatsApp indisponível. */
  connectionAvailable?: boolean;
  /** `false` => mídia do item ainda não pronta. */
  mediaReady?: boolean;
  /** RESERVADO: `true` => exige template do WhatsApp (fora de janela). */
  requiresTemplate?: boolean;
}

/** Decisão devolvida pela cascata. */
export interface EligibilityDecision {
  class: EligibilityClass;
  reason: EligibilityReason;
}

/** Só os dígitos de um telefone — usado para casar a blacklist por número. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Verdadeiro quando o destino (por dígitos) está na lista de opt-out.
 * Lista vazia/ausente ou destino sem dígitos => não suprimido (falso).
 */
function isBlacklisted(destination: string, blacklist?: readonly string[] | null): boolean {
  if (!Array.isArray(blacklist) || blacklist.length === 0) return false;
  const target = digitsOnly(destination);
  if (target === "") return false;
  return blacklist.some((entry) => typeof entry === "string" && digitsOnly(entry) === target);
}

/**
 * Decide a elegibilidade de `recipient` sob `ctx`. PURA e determinística: mesmas
 * entradas => mesma decisão, sem I/O e sem efeito colateral.
 *
 * A cascata abaixo é a ordem de precedência documentada no cabeçalho.
 */
export function eligibility(
  recipient: EligibilityRecipient | null | undefined,
  ctx?: EligibilityContext | null,
): EligibilityDecision {
  const context = ctx ?? {};
  const destination = typeof recipient?.destination === "string" ? recipient.destination.trim() : "";

  // 1) Sem destino (ou marcado inválido): nada mais é avaliável.
  if (destination === "") {
    return { class: "no_destination", reason: "missing_destination" };
  }
  if (context.destinationValid === false) {
    return { class: "no_destination", reason: "invalid_destination" };
  }

  // 2) Opt-out (talkx_blacklist) — bloqueio duro, domina o transitório.
  if (isBlacklisted(destination, context.blacklist)) {
    return { class: "suppressed", reason: "talkx_blacklist" };
  }

  // 3) Fora do escopo do público — política estável.
  if (context.inScope === false) {
    return { class: "out_of_scope", reason: "out_of_scope" };
  }

  // 4) Transporte indisponível — transitório, mais amplo que a mídia do item.
  if (context.connectionAvailable === false) {
    return { class: "connection_unavailable", reason: "connection_unavailable" };
  }

  // 5) Mídia do item pendente — transitório.
  if (context.mediaReady === false) {
    return { class: "media_pending", reason: "media_pending" };
  }

  // 6) Exige template (RESERVADO) — só com sinal explícito; inerte por padrão.
  if (context.requiresTemplate === true) {
    return { class: "requires_template", reason: "requires_template" };
  }

  // 7) Nenhum bloqueio.
  return { class: "eligible", reason: "eligible" };
}
