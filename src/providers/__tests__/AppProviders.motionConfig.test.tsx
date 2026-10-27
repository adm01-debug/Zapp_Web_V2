/**
 * A11Y — `MotionConfig reducedMotion="user"` num único lugar da raiz.
 *
 * Antes cada tela ligava (ou esquecia) o seu próprio MotionConfig; Contatos
 * tinha um `<MotionConfig>` local. A configuração passa a valer para o app
 * inteiro, então a raiz precisa ter exatamente UM e as telas não podem manter
 * o delas.
 *
 * AppProviders usa MotionConfig síncrono (sem LazyMotion): framer-motion já
 * está no bundle inicial pelo uso de motion.* nas telas; a extração
 * assíncrona não reduz o bundle e quebra o JSDOM (Vitest).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('movimento reduzido na raiz (A11Y)', () => {
  it('1. AppProviders tem exatamente um MotionConfig reducedMotion="user"', () => {
    const fonte = ler('../AppProviders.tsx');

    // MotionConfig aplica reducedMotion globalmente (síncrono, sem LazyMotion)
    expect(fonte.match(/<MotionConfig\s+reducedMotion="user">/g) ?? []).toHaveLength(1);
    expect(fonte.match(/<\/MotionConfig>/g) ?? []).toHaveLength(1);
    // Importado do framer-motion
    expect(fonte).toMatch(/import \{[^}]*\bMotionConfig\b[^}]*\} from "framer-motion";/);
  });

  it('2. ContactsView largou o MotionConfig próprio (e o import)', () => {
    const fonte = ler('../../components/contacts/ContactsView.tsx');

    expect(fonte).not.toMatch(/MotionConfig/);
  });
});
