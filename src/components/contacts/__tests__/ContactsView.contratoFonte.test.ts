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
 * - a configuração de movimento reduzido deve governar Contatos pela raiz,
 *   sem depender de um provedor local que possa divergir do resto do app;
 * - o `PageHeader` voltou por import direto, então a fonte é o ponto mais
 *   barato de barrar o retorno dele antes de qualquer render.
 */
describe('ContactsView — contrato de fonte', () => {
  const fonte = readFileSync(
    resolve(process.cwd(), 'src/components/contacts/ContactsView.tsx'),
    'utf8',
  );
  const appFonte = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('herda movimento reduzido da raiz sem provedor local', () => {
    expect(appFonte).toContain('<MotionConfig reducedMotion="user">');
    expect(appFonte).toMatch(/<LazyMotionConfig>\s*<AppRoutes\s*\/>\s*<\/LazyMotionConfig>/);
    expect(fonte).not.toContain('MotionConfig');
  });

  it('não importa nem renderiza PageHeader', () => {
    expect(fonte).not.toContain('PageHeader');
  });
});
