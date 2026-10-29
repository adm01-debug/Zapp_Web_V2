import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da varredura de acessibilidade (axe-core 4.13) da tela de CAMPANHAS (view 'multiplix').
 * Evidencia: ~/evidencias/axe-telas/campanhas.md (4 estados, app logado).
 *
 * Achado corrigido:
 *   [critical] button-name x12 (3 por estado) — os tres filtros da tela nao tinham nome
 *   acessivel: o rotulo VISUAL em <span> nao estava associado ao controle. Sem nome
 *   acessivel, o leitor de tela anuncia apenas "combobox". O aria-label usa exatamente o
 *   texto visivel (Publico, Ramo, UF).
 *
 * TL-040/F73 trocou DOIS desses controles por outros do mesmo papel: Publico virou
 * multipla selecao (Popover + Checkbox, porque papeis nao sao exclusivos) e Ramo virou
 * combobox com busca (Popover + Command, sobre os 566 valores do servidor); UF segue
 * `<SelectTrigger>`. O contrato continua exigindo o MESMO nome acessivel nos tres — o que
 * mudou foi o elemento que carrega o rotulo, nao a exigencia.
 *
 * Registrados, nao corrigidos: familia --destructive (3,78:1 / 3,0:1 / 2,99:1 / 2,45:1 / 3,91:1),
 * chip invertido 4,45:1 no alto contraste, e .text-[13px] com 1,64:1 (cinza claro sobre claro,
 * candidato a alfa em text-muted-foreground). O `region` medido veio do overlay do tour, que
 * estava aberto durante a varredura.
 */
const raiz = resolve(__dirname, '../..');

describe('contrato: acessibilidade da tela de campanhas (axe)', () => {
  const fonte = readFileSync(resolve(raiz, 'src/components/multiplix/MultiplixView.tsx'), 'utf8');

  it('os tres filtros de campanhas tem nome acessivel igual ao rotulo visivel, no PROPRIO elemento gatilho', () => {
    // Publico/Ramo: <Button> (gatilho do Popover+Checkbox / Popover+Command).
    expect(fonte).toMatch(/<Button[^>]*aria-label="Público"/);
    expect(fonte).toMatch(/<Button[^>]*aria-label="Ramo"/);
    // UF: continua <SelectTrigger>.
    expect(fonte).toMatch(/<SelectTrigger[^>]*aria-label="UF"/);
  });

  it('nenhum controle dos filtros ficou sem aria-label', () => {
    // O unico filtro que continua <Select> (UF) segue exigindo o aria-label...
    const triggers = fonte.match(/<SelectTrigger[^>]*>/g) ?? [];
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    for (const t of triggers) expect(t).toMatch(/aria-label=/);

    // ...e os dois que viraram combobox/multi-selecao carregam o mesmo rotulo
    // visivel no PROPRIO <Button> gatilho do Popover (nao num elemento qualquer).
    const botoesDeFiltro = fonte.match(/<Button[^>]*aria-label="(Público|Ramo)"[^>]*>/g) ?? [];
    expect(botoesDeFiltro.length).toBe(2);
  });
});
