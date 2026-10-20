/**
 * Guarda da media query de contraste (achado de 03/10).
 *
 * `src/styles/accessibility.css` usava `@media (prefers-contrast: high)`. `high` nao e valor
 * valido da spec — os valores sao `no-preference | more | less | custom` — e nao casa em
 * navegador nenhum. Medido em producao: emulando `prefers-contrast: more`, o `matchMedia`
 * devolvia `{high: false, more: true}`, ou seja, quem pedia mais contraste no sistema
 * operacional nao recebia nada.
 *
 * Este teste le o CSS como texto porque o ajuste e a propria condicao da media query: sem ele
 * nenhum dos dois ramos (`:root` e `.dark`) chega a valer, e um teste de jsdom nao avalia
 * media queries — o que aferimos aqui e o contrato do arquivo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// `import.meta.url` no ambiente do vitest e uma URL http (nao `file`), e `readFileSync` recusa:
// usar caminho relativo a raiz do projeto, que e o cwd do vitest.
const css = readFileSync('src/styles/accessibility.css', 'utf8');

describe('accessibility.css — prefers-contrast', () => {
  it('usa o valor válido `more`, que é o que o navegador reconhece', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
  });

  it('não usa `high`, que não casa em nenhum navegador', () => {
    // Comentarios explicam o achado e por isso citam `high`; o que nao pode existir e a
    // CONDICAO da media query com ele.
    expect(css).not.toMatch(/@media[^{]*prefers-contrast:\s*high/);
  });
});
