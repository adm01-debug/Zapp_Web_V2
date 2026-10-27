/**
 * A11Y — `MotionConfig reducedMotion="user"` num único lugar da raiz.
 *
 * Antes cada tela ligava (ou esquecia) o seu próprio MotionConfig; Contatos
 * tinha um `<MotionConfig>` local. A configuração passa a valer para o app
 * inteiro. O MotionConfig agora vive em App.tsx (SL-103 restore) como
 * LazyMotionConfig — carregamento preguiçoso para manter vendor-motion fora
 * do bundle inicial. AppProviders não deve mais ter MotionConfig.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('movimento reduzido na raiz (A11Y)', () => {
  it('1. App.tsx carrega MotionConfig em lazy e aplica reducedMotion="user"', () => {
    const appFonte = ler('../../App.tsx');

    // LazyMotionConfig importa MotionConfig do framer-motion de forma lazy
    expect(appFonte).toMatch(/import\(['"]framer-motion['"]\)/);
    expect(appFonte).toMatch(/MotionConfig/);
    // reducedMotion="user" está presente exatamente uma vez
    expect(appFonte.match(/reducedMotion="user"/g) ?? []).toHaveLength(1);

    // AppProviders não deve mais importar nem usar MotionConfig
    const providersFonte = ler('../AppProviders.tsx');
    expect(providersFonte).not.toMatch(/MotionConfig/);
  });

  it('2. ContactsView largou o MotionConfig próprio (e o import)', () => {
    const fonte = ler('../../components/contacts/ContactsView.tsx');

    expect(fonte).not.toMatch(/MotionConfig/);
  });
});
