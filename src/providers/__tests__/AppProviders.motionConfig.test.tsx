/**
 * A11Y — `MotionConfig reducedMotion="user"` num único lugar da raiz.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
describe('movimento reduzido na raiz (A11Y)', () => {
  it('1. App.tsx carrega MotionConfig em lazy e aplica reducedMotion="user"', () => {
    const appFonte = ler('../../App.tsx');
    expect(appFonte).toMatch(/import\(['"](framer-motion)['"]\)/);
    expect(appFonte).toMatch(/MotionConfig/);
    expect(appFonte.match(/reducedMotion="user"/g) ?? []).toHaveLength(1);
    const providersFonte = ler('../AppProviders.tsx');
    expect(providersFonte).not.toMatch(/MotionConfig/);
  });
  it('2. ContactsView largou o MotionConfig próprio (e o import)', () => {
    expect(ler('../../components/contacts/ContactsView.tsx')).not.toMatch(/MotionConfig/);
  });
});
