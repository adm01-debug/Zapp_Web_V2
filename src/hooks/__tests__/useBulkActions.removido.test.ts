/**
 * Remoção do hook `useBulkActions` (exclusão/arquivamento por tabela arbitrária).
 *
 * O `useBulkActions` genérico montava `.delete().in('id', ids)` a partir de um
 * `tableName?: string` que o chamador passava — qualquer tela podia apagar em massa
 * de qualquer tabela do banco, sem lista de tabelas permitidas. O hook não tem
 * nenhum consumidor de produção (`git grep -n "useBulkActions" -- src` devolvia só
 * o próprio módulo, o barrel `hooks/inbox/index.ts` e os testes) — a exclusão em
 * massa de contatos vive no `useInboxBulkActions`, com escopo fechado.
 *
 * Sem consumidor não há comportamento para exercitar por render: a prova é o
 * resíduo continuar fora do repositório e nenhum módulo voltar a apontar para ele.
 * Se o hook voltar, tem que voltar com consumidor real e lista de tabelas permitidas
 * (`BULK_ACTIONS_ALLOWLIST`) — aí esta guarda sai no mesmo cartão.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const RESIDUO = 'src/hooks/inbox/useBulkActions.ts';
const REFERENCIA = 'useBulkActions';
// Substituto legítimo — pode mencionar o nome antigo em comentários
const SUBSTITUTO = 'useInboxBulkActions.ts';
const ESTE_TESTE = 'useBulkActions.removido.test.ts';

function arquivosFonte(diretorio: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivosFonte(caminho, achados);
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

describe('resíduo do hook useBulkActions (exclusão por tabela arbitrária)', () => {
  it('o hook genérico não voltou ao repositório', () => {
    expect(
      existsSync(join(raiz, RESIDUO)),
      `${RESIDUO} está no repositório de novo — se voltou com consumidor real e lista de tabelas permitidas, remova esta guarda no mesmo cartão`,
    ).toBe(false);
  });

  it('nenhum módulo de src aponta para o hook removido', () => {
    const referencias = arquivosFonte(join(raiz, 'src'))
      .filter((arquivo) => !arquivo.endsWith(ESTE_TESTE))
      .filter((arquivo) => !arquivo.endsWith(SUBSTITUTO))
      .filter((arquivo) => readFileSync(arquivo, 'utf8').includes(REFERENCIA))
      .map((arquivo) => relative(raiz, arquivo));

    expect(referencias).toEqual([]);
  });
});
