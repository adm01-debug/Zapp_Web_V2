import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de contrato do plano de 50 etapas (cabeçalho de Contatos).
 *
 * O comportamento visível já é provado em `ContactsView.v2Flags.test.tsx`
 * (nenhum <header>, h1 sr-only, indicadores antes das abas). Este arquivo
 * cobre o que não aparece na árvore renderizada e regrediu sem quebrar teste:
 *
 * - o `MotionConfig reducedMotion="user"` que governa os descendentes Framer
 *   Motion do módulo foi removido no lote 880 (025d0258dc) junto do cabeçalho;
 * - o `PageHeader` voltou por import direto, então a fonte é o ponto mais
 *   barato de barrar o retorno dele antes de qualquer render.
 */
describe('ContactsView — contrato de fonte', () => {
  const fonte = readFileSync(
    resolve(process.cwd(), 'src/components/contacts/ContactsView.tsx'),
    'utf8',
  );

  it('mantém o MotionConfig reducedMotion="user" no módulo', () => {
    expect(fonte).toContain('<MotionConfig reducedMotion="user">');
  });

  it('não importa nem renderiza PageHeader', () => {
    expect(fonte).not.toContain('PageHeader');
  });
});
