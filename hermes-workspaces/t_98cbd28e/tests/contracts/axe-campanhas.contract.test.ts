import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da varredura de acessibilidade (axe-core 4.13) da tela de CAMPANHAS (view 'multiplix').
 * Evidencia: ~/evidencias/axe-telas/campanhas.md (4 estados, app logado).
 *
 * Achado corrigido:
 *   [critical] button-name x12 (3 por estado) — os tres filtros da tela sao comboboxes do Radix
 *   (SelectTrigger) com rotulo VISUAL em <span> que nao estava associado ao controle. Sem nome
 *   acessivel, o leitor de tela anuncia apenas "combobox". Foi o achado mais severo das 4 telas
 *   varridas ate aqui. O aria-label usa exatamente o texto visivel (Publico, Ramo, UF).
 *
 * Registrados, nao corrigidos: familia --destructive (3,78:1 / 3,0:1 / 2,99:1 / 2,45:1 / 3,91:1),
 * chip invertido 4,45:1 no alto contraste, e .text-[13px] com 1,64:1 (cinza claro sobre claro,
 * candidato a alfa em text-muted-foreground). O `region` medido veio do overlay do tour, que
 * estava aberto durante a varredura.
 */
const raiz = resolve(__dirname, '../..');

describe('contrato: acessibilidade da tela de campanhas (axe)', () => {
  const fonte = readFileSync(resolve(raiz, 'src/components/multiplix/MultiplixView.tsx'), 'utf8');

  it('os tres filtros de campanhas tem nome acessivel igual ao rotulo visivel', () => {
    for (const rotulo of ['Público', 'Ramo', 'UF']) {
      expect(fonte).toMatch(new RegExp(`<SelectTrigger aria-label="${rotulo}"`));
    }
  });

  it('nenhum SelectTrigger dos filtros ficou sem aria-label', () => {
    const triggers = fonte.match(/<SelectTrigger[^>]*>/g) ?? [];
    expect(triggers.length).toBeGreaterThanOrEqual(3);
    for (const t of triggers) expect(t).toMatch(/aria-label=/);
  });
});
