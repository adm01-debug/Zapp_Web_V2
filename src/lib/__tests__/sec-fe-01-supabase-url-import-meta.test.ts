import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * SEC-FE-01 — auditoria de segurança do front (2026-10-07). Trava de regressão.
 *
 * O ambiente de hospedagem injeta `VITE_SUPABASE_URL` apontando para OUTRO projeto —
 * o próprio `src/integrations/supabase/client.ts` documenta isso. A URL canônica do
 * banco vem de `src/config/supabase.ts` (`SUPABASE_URL`). Duas pontas furavam a regra:
 * `useTalkXTemplates.testTemplate` montava a chamada da Edge com a variável do ambiente
 * E mandava o JWT do usuário nesse host; `teamChatParts.MediaContent` montava a URL de
 * objeto de storage ali também.
 *
 * A agulha é montada em pedaços DE PROPÓSITO: escrita inteira, este próprio arquivo
 * casaria com a busca e o teste acusaria a si mesmo.
 */
const AGULHA = ['import', 'meta', 'env', 'VITE_SUPABASE_URL'].join('.');

/** Linhas de `src/` que casam com a agulha. Vazio = nenhuma leitura da variável. */
function procurar(agulha: string): string[] {
  let saida: string;
  try {
    saida = execFileSync('git', ['grep', '-nI', '-e', agulha, '--', 'src'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  } catch (erro) {
    // `git grep` devolve 1 quando não encontra nada — é o resultado esperado.
    if ((erro as { status?: number }).status === 1) return [];
    throw new Error(
      `não foi possível rodar "git grep" em src/ (rode o teste dentro do repositório): ${
        (erro as Error).message
      }`,
    );
  }
  return saida
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
}

describe('SEC-FE-01 — a URL do Supabase não sai da variável de ambiente', () => {
  it('a busca funciona (controle positivo: acha um símbolo que existe em src/)', () => {
    // Sem este controle, uma busca quebrada (que não varre nada) faria o guarda passar
    // para sempre — teste tautológico.
    expect(procurar('PRODUCTION_SUPABASE_URL').length).toBeGreaterThan(0);
  });

  it('nenhum arquivo de src/ lê a URL de import.meta.env', () => {
    const achados = procurar(AGULHA);
    expect(
      achados,
      `SEC-FE-01: a URL do Supabase deve vir de @/config/supabase. Achei:\n${achados.join('\n')}`,
    ).toEqual([]);
  });
});
