/**
 * Guarda de integridade dos testes de Team Chat — cartao t_001cfcd4 (item 166, TC-011).
 *
 * O defeito: 271 asserts tautologicos (`expect(true).toBe(true)` e variantes)
 * nos testes de Team Chat. Cada `it` passava sempre, sem afirmar nada. A
 * convencao do repositorio (`calls-access.test.ts`) e: assercao real sobre a
 * fonte/comportamento, ou `it.todo` honesto para o que ainda nao existe.
 *
 * Este guarda trava a reintroducao do padrao. O literal proibido e montado por
 * concatenacao para que este arquivo nao se acuse sozinho.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const TEAM_CHAT_TESTS = join(process.cwd(), 'src', 'components', 'team-chat', '__tests__');

/** `expect(true)` literal — montado sem o literal para nao se autoacusar. */
const TAUTOLOGIA = new RegExp('expect' + String.raw`\(\s*true\s*\)`);

const arquivos = readdirSync(TEAM_CHAT_TESTS)
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => join(TEAM_CHAT_TESTS, f));

describe('Guarda de integridade — asserts tautologicos no Team Chat (TC-011)', () => {
  it('a varredura enxerga os arquivos de teste (nao passa por vacuidade)', () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(3);
    for (const f of arquivos) expect(() => readFileSync(f, 'utf8')).not.toThrow();
  });

  it('o detector reconhece o padrao proibido (nao passa cego)', () => {
    for (const amostra of ['expect(true).toBe(true)', 'expect( true ).toBe(true)']) {
      expect(amostra).toMatch(TAUTOLOGIA);
    }
    for (const amostra of ["expect(isMember('a')).toBe(true)", 'expect(ok).toBe(true)']) {
      expect(amostra).not.toMatch(TAUTOLOGIA);
    }
  });

  it('nenhum teste de Team Chat contem expect(true)', () => {
    const infratores = arquivos.filter((f) => TAUTOLOGIA.test(readFileSync(f, 'utf8')));
    expect(infratores).toEqual([]);
  });
});
