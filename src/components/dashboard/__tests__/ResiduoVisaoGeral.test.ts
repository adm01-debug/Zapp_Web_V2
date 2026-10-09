/**
 * SL-170 · inventário RES-limpeza (Dashboard/Analytics) · resíduo da Visão Geral.
 *
 * O `RealtimeMetricsPanel` era o painel de métricas em tempo real da Visão Geral do
 * Dashboard. O redesign Navy o substituiu pelo `DashboardKpiRow`
 * (docs/design/REDESIGN_DASHBOARD_STATUS.md, CP9) e ele ficou sem nenhum importador:
 * `git grep -n "RealtimeMetricsPanel" -- src` devolvia só o próprio arquivo (e um
 * comentário em `DashboardView.tsx`). A remoção estava pendente no inventário.
 *
 * Sem importador não existe tela que renderize o painel — não há comportamento para
 * exercitar por render. A prova é o resíduo continuar fora do repositório e nenhum
 * módulo voltar a apontar para ele (o histórico tem um "Restored dead files",
 * a2b733ecf, que reabriu resíduos já removidos em silêncio).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const RESIDUO = 'src/components/dashboard/RealtimeMetricsPanel.tsx';
const REFERENCIA = 'dashboard/RealtimeMetricsPanel';
const ESTE_TESTE = 'ResiduoVisaoGeral.test.ts';

function arquivosFonte(diretorio: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivosFonte(caminho, achados);
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

describe('resíduo da Visão Geral do Dashboard (SL-170)', () => {
  it('o painel de métricas em tempo real não voltou ao repositório', () => {
    expect(
      existsSync(join(raiz, RESIDUO)),
      `${RESIDUO} está no repositório de novo — se voltou com uso real, remova esta guarda no mesmo cartão`,
    ).toBe(false);
  });

  it('nenhum módulo de src aponta para o painel removido', () => {
    const referencias = arquivosFonte(join(raiz, 'src'))
      .filter((arquivo) => !arquivo.endsWith(ESTE_TESTE))
      .filter((arquivo) => readFileSync(arquivo, 'utf8').includes(REFERENCIA))
      .map((arquivo) => relative(raiz, arquivo));

    expect(referencias).toEqual([]);
  });
});
