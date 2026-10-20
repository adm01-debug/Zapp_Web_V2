/**
 * A11Y — `MotionConfig reducedMotion="user"` num único lugar da raiz.
 *
 * Antes cada tela ligava (ou esquecia) o seu próprio MotionConfig; Contatos
 * tinha um `<MotionConfig>` local. A configuração passa a valer para o app
 * inteiro, então a raiz precisa ter exatamente UM e as telas não podem manter
 * o delas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('movimento reduzido na raiz (A11Y)', () => {
  it('1. AppProviders tem exatamente um MotionConfig reducedMotion="user"', () => {
    const fonte = ler('../AppProviders.tsx');

    expect(fonte.match(/<MotionConfig\s+reducedMotion="user">/g) ?? []).toHaveLength(1);
    expect(fonte.match(/<\/MotionConfig>/g) ?? []).toHaveLength(1);
    expect(fonte).toMatch(/import \{ MotionConfig \} from "framer-motion";/);
  });

  it('2. ContactsView largou o MotionConfig próprio (e o import)', () => {
    const fonte = ler('../../components/contacts/ContactsView.tsx');

    expect(fonte).not.toMatch(/MotionConfig/);
  });
});
