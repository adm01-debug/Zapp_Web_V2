/**
 * Cartão t_a4963b0f — ORDEM DO JOAQUIM (12/10/2026): a função de tags de
 * contato/conversa não deve existir no Zapp Web.
 *
 * `src/lib/tags.ts` é a base da função. Esta guarda de fonte prova que os
 * helpers de tag de contato SEM consumidor fora do próprio módulo saíram e não
 * podem voltar em silêncio; vermelho antes da remoção, verde depois.
 *
 * Os helpers que AINDA têm consumidor fora deste arquivo ficam de pé pela
 * regra do cartão ("não remova membro exportado que ainda tenha consumidor
 * fora destes arquivos") e caem junto com as telas/hook nos cards
 * t_35950a99 (BulkActionsBar/ContactBulkTagDialog) e t_06e5f559
 * (useContactsSearch):
 *   - isWhatsAppTag   → BulkActionsBar.tsx, ContactBulkTagDialog.tsx
 *   - getTagDisplayName → BulkActionsBar.tsx, ContactBulkTagDialog.tsx
 *   - filterCustomTags → BulkActionsBar.tsx, ContactBulkTagDialog.tsx, useContactsSearch.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caminhoTags = resolve(process.cwd(), "src/lib/tags.ts");
const fonteTags = existsSync(caminhoTags) ? readFileSync(caminhoTags, "utf8") : "";

describe("lib/tags.ts — função de tags de contato", () => {
  it("não exporta mais os helpers de tag de contato sem consumidor", () => {
    for (const nome of ["parseWhatsAppTag", "normalizeTag", "filterWATags"]) {
      expect(fonteTags, `${nome} não pode voltar a ser exportado`).not.toMatch(
        new RegExp(`export\\s+(?:function|const)\\s+${nome}\\b`),
      );
    }
    expect(fonteTags, "o tipo TagArray não pode voltar").not.toMatch(
      /export\s+type\s+TagArray\b/,
    );
  });

  it("mantém só os helpers com consumidor fora do módulo (regra do cartão)", () => {
    const exportados = Array.from(
      fonteTags.matchAll(/export\s+(?:function|const)\s+(\w+)/g),
      (m) => m[1],
    );
    expect(new Set(exportados)).toEqual(
      new Set(["isWhatsAppTag", "getTagDisplayName", "filterCustomTags"]),
    );
  });
});
