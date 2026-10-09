/**
 * TL-002 · Talk X — o hook de supressão de `src/hooks/integrations/` (o módulo que a
 * auditoria de 2026-09-29 registrou como código morto) foi removido fisicamente.
 *
 * Por que ele era morto: nenhum arquivo do repositório o importava — a busca em
 * `src`, `e2e`, `tests`, `supabase/functions` e `scripts` só encontrava a própria
 * declaração — e ele divergia da tela `src/components/talkx/TalkXSuppression.tsx`,
 * que faz as próprias queries. Além disso, removia com `DELETE` físico, contra a
 * trilha append-only do módulo.
 *
 * Este guarda trava a volta do módulo morto de duas formas: tenta CARREGAR o arquivo
 * de verdade pelo resolvedor de módulos (tem de falhar com ERR_MODULE_NOT_FOUND) e
 * varre a árvore de código para garantir que nenhum arquivo voltou a citá-lo. O
 * identificador é montado por concatenação para que este arquivo não se acuse sozinho.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();

/** Identificador do hook montado sem o literal, para o guarda não se autoacusar. */
const IDENTIFICADOR = 'useTalkX' + 'Suppression';
const PADRAO = new RegExp(IDENTIFICADOR);

/** Caminho do módulo morto, também sem o literal completo. */
const MODULO_MORTO = join(RAIZ, 'src', 'hooks', 'integrations', IDENTIFICADOR + '.ts');

/** Raízes de código onde o módulo morto não pode reaparecer. */
const RAIZES = ['src', 'e2e', 'tests', 'supabase/functions', 'scripts'].map((p) => join(RAIZ, p));
const CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORAR = /(^|[/\\])(node_modules|dist|coverage|\.tmp|\.git)([/\\]|$)/;

function varrer(dir: string, achados: string[] = []): string[] {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return achados; // raiz ausente não invalida a varredura das outras
  }
  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name);
    if (IGNORAR.test(caminho)) continue;
    if (entrada.isDirectory()) varrer(caminho, achados);
    else if (CODIGO.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

const arquivos = RAIZES.flatMap((raiz) => varrer(raiz));

describe('Talk X · supressão — o hook morto foi removido (TL-002)', () => {
  it('o módulo morto não carrega mais: o resolvedor devolve ERR_MODULE_NOT_FOUND', async () => {
    const erro = await import(/* @vite-ignore */ pathToFileURL(MODULO_MORTO).href).then(
      () => null,
      (e: unknown) => e as NodeJS.ErrnoException,
    );

    // Com o arquivo de volta, o import resolve e executa o módulo (erro = null).
    expect(erro?.code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('a varredura enxerga a árvore de código (não passa por vacuidade)', () => {
    expect(arquivos.length).toBeGreaterThan(500);
    for (const raiz of RAIZES) {
      expect(
        arquivos.some((f) => f.startsWith(raiz)),
        `nenhum arquivo varrido em ${relative(RAIZ, raiz)}`,
      ).toBe(true);
    }
  });

  it('o detector reconhece o identificador e ignora o vizinho parecido (não passa cego)', () => {
    expect(`export function ${IDENTIFICADOR}() {`).toMatch(PADRAO);
    expect('export function useTalkXMonitor() {').not.toMatch(PADRAO);
  });

  it('o módulo morto não existe mais no repositório', () => {
    expect(existsSync(MODULO_MORTO), `ainda existe: ${relative(RAIZ, MODULO_MORTO)}`).toBe(false);
  });

  it('nenhum arquivo de código cita o módulo morto', () => {
    const infratores = arquivos
      .filter((f) => PADRAO.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RAIZ, f).replace(/\\/g, '/'));

    expect(infratores).toEqual([]);
  });
});
