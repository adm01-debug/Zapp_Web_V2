// ─────────────────────────────────────────────────────────────────────────────
// messaging/phone.ts — fachada única do E.164 brasileiro (Bloco D / F38).
//
// A fonte de verdade da heurística anti-LID e da geração das variantes do 9º
// dígito já existe e está testada em ../evolution-helpers.ts:
//   • normalizePhone         — evolution-helpers.ts L33 (rejeita @lid e
//                              14-15 dígitos nus como possível LID)
//   • generatePhoneVariants  — evolution-helpers.ts L262 (9º dígito BR)
//
// Este módulo NÃO reimplementa nada: reexporta a MESMA função, para que o kernel
// de mensageria importe daqui sem duplicar a heurística. Copiar a lógica criaria
// uma segunda definição que diverge em silêncio na próxima correção.
//
// Por que existe: multiplix-send/index.ts L437 faz
//   `recipient.destino_e164.replace(/\D/g, "")`
// — um strip cru que (a) aceita um LID de 14-15 dígitos que normalizePhone
// recusa e (b) não produz as variantes do 9º dígito. A prova está em
// ../__tests__/phone.test.ts (red-before).
// ─────────────────────────────────────────────────────────────────────────────

import { generatePhoneVariants, normalizePhone } from "../evolution-helpers.ts";

export { generatePhoneVariants, normalizePhone };

/** Retorno de normalizePhone: E.164 só-dígitos, ou null quando recusado. */
export type NormalizedPhone = string | null;

/** Telefone brasileiro em E.164 só-dígitos (DDI 55 incluso). */
export type E164Phone = string;

// ─── Trava de contrato em tempo de compilação ────────────────────────────────
// Não é runtime: se a assinatura de evolution-helpers mudar (parâmetro opcional
// virar obrigatório, retorno mudar de tipo), estas atribuições param de compilar
// no `deno check`. Isso força o mantenedor a decidir se a fachada pode seguir
// reexportando — em vez de descobrir a divergência em produção.
const _normalizePhoneShape: (rawJid?: string) => NormalizedPhone = normalizePhone;
const _generatePhoneVariantsShape: (phone: string) => E164Phone[] = generatePhoneVariants;
void _normalizePhoneShape;
void _generatePhoneVariantsShape;
