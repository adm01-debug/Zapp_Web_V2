import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da varredura de acessibilidade (axe-core 4.13) da tela de CONTATOS.
 * Evidencia: ~/evidencias/axe-telas/contatos.md (4 estados de tema, app logado).
 *
 * Achado corrigido aqui:
 *   [critical] button-name — o Checkbox de selecao do card (Radix, role=checkbox)
 *   nao tinha nome acessivel: o leitor de tela anunciaca "caixa de selecao" sem dizer de quem.
 *
 * Registrados, NAO corrigidos (numeros medidos no inbox e repetidos aqui):
 *   banner de conexao branco sobre --destructive 3,78:1 (claro/escuro)
 *   botao "reconectar" 2,99:1 (claro), 2,45:1 (escuro), 3,91:1 (HC escuro)
 *   chip invertido (.bg-primary-foreground) 4,46:1 no escuro+alto contraste (par do tema)
 *   nested-interactive e aria-valid-attr-value: artefatos do Radix na renderizacao do Checkbox
 */
const raiz = resolve(__dirname, '../..');
const card = readFileSync(resolve(raiz, 'src/components/contacts/ContactCard.tsx'), 'utf8');

describe('contrato: acessibilidade dos cards de contato (axe)', () => {
  it('o checkbox de selecao do card tem nome acessivel', () => {
    const bloco = card.match(/<Checkbox[\s\S]{0,400}?\/>/)?.[0] ?? '';
    expect(bloco).not.toBe('');
    expect(bloco).toMatch(/aria-label=\{/);
  });
});
