import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da varredura de acessibilidade (axe-core 4.13) da tela de TAREFAS.
 * Evidencia: ~/evidencias/axe-telas/tarefas.md (4 estados, app logado).
 *
 * Achado corrigido:
 *   [serious] label-title-only — o input de adicionar tarefa rapida (data-testid
 *   "quick-add-input") so gerava nome pelo atributo title ("Atalhos: Ctrl+1 ...").
 *   Muitos leitores de tela ignoram title; agora ha aria-label.
 *
 * Registrados, nao corrigidos: color-contrast da familia --destructive (3,78:1 claro /
 * 3,0:1 escuro no banner; 2,99:1 / 2,45:1 no botao reconectar), region e
 * page-has-heading-one (alvo `html`, do shell/documento).
 */
const raiz = resolve(__dirname, '../..');

describe('contrato: acessibilidade da tela de tarefas (axe)', () => {
  it('o campo de adicionar tarefa tem nome acessivel proprio (nao so title)', () => {
    const q = readFileSync(resolve(raiz, 'src/components/tasks/shared/QuickAdd.tsx'), 'utf8');
    const bloco = q.match(/data-testid="quick-add-input"([\s\S]{0,900})/)?.[1] ?? '';
    expect(bloco).not.toBe('');
    expect(bloco).toMatch(/aria-label=/);
  });
});
