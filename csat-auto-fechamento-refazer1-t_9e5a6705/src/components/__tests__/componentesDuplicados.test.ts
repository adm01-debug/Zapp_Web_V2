/**
 * SL-175 · Design System/UI · inventário "componentes duplicados" (frontend 5).
 *
 * O relatório de refatoração (docs/REFACTORING_REPORT_2026-06-12.md, §Frontend 5)
 * listou 7 pares de componentes com o mesmo nome. Na ponta de dia/2026-10-08 só
 * 4 pares eram duplicata de verdade: a cópia de fora do módulo não tinha NENHUM
 * importador (`git grep -n "<nome>" -- src` devolvia só o próprio arquivo),
 * enquanto o canônico — o que as telas usam de fato — seguia vivo:
 *
 *   par                cópia removida (sem importador)                 canônico que ficou
 *   BulkActionsBar     src/components/BulkActionsBar.tsx               src/components/contacts/BulkActionsBar.tsx
 *   TrendIndicator     src/components/dashboard/TrendIndicator.tsx     src/components/dashboard/metrics/TrendIndicator.tsx
 *   MetricComparison   src/components/dashboard/MetricComparison.tsx   src/components/dashboard/metrics/MetricComparison.tsx
 *   MiniSparkline      src/components/dashboard/MiniSparkline.tsx      src/components/dashboard/metrics/MiniSparkline.tsx
 *
 * O MiniSparkline de src/components/dashboard era um wrapper `@deprecated` sobre o
 * canônico com um único consumidor (GamificationEffects), migrado neste cartão.
 *
 * Os outros 3 pares NÃO são duplicatas — os dois lados estão vivos, com API e
 * render próprios, e cada um serve uma tela diferente:
 *  - FloatingParticles: dashboard (sem props, DOM + framer-motion, camada fixa de
 *    fundo, 12 telas) x voice (prop `phase: VoiceAgentPhase`, Canvas com linhas de
 *    constelação, só o VoiceSearchOverlay);
 *  - ConversationHeatmap: dashboard (props `data`/`metric`/`onCellClick`, 3 métricas,
 *    hotspots) x reports (sem props, busca os próprios dados, seletor 7/30/90 dias);
 *  - ScheduledReportsManager: dashboard (Card com mutations diretas, destinatários em
 *    texto livre, sem edição) x reports (hook useScheduledReports, chips, editar e
 *    "enviar agora").
 *
 * Sem importador não existe tela para exercitar por render, então a prova é o
 * resíduo continuar fora do repositório e nenhum módulo voltar a apontar para ele
 * (o histórico tem um "Restored dead files", a2b733ecf, que já reabriu resíduos
 * removidos em silêncio).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const ESTE_TESTE = 'componentesDuplicados.test.ts';

const COPIAS_REMOVIDAS = [
  'src/components/BulkActionsBar.tsx',
  'src/components/dashboard/TrendIndicator.tsx',
  'src/components/dashboard/MetricComparison.tsx',
  'src/components/dashboard/MiniSparkline.tsx',
];

const REFERENCIAS_PROIBIDAS = [
  'components/BulkActionsBar',
  'dashboard/TrendIndicator',
  'dashboard/MetricComparison',
  'dashboard/MiniSparkline',
];

const CANONICOS = [
  'src/components/contacts/BulkActionsBar.tsx',
  'src/components/dashboard/metrics/TrendIndicator.tsx',
  'src/components/dashboard/metrics/MetricComparison.tsx',
  'src/components/dashboard/metrics/MiniSparkline.tsx',
];

function arquivosFonte(diretorio: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivosFonte(caminho, achados);
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

describe('componentes duplicados do inventário (SL-175)', () => {
  it('nenhuma das 4 cópias sem importador voltou ao repositório', () => {
    for (const copia of COPIAS_REMOVIDAS) {
      expect(
        existsSync(join(raiz, copia)),
        `${copia} está no repositório de novo — se voltou com uso real, remova esta guarda no mesmo cartão`,
      ).toBe(false);
    }
  });

  it('mantém exatamente um canônico vivo por par', () => {
    for (const canonico of CANONICOS) {
      expect(existsSync(join(raiz, canonico)), `${canonico} (canônico do par) desapareceu`).toBe(true);
    }
  });

  it('nenhum módulo de src aponta para as cópias removidas', () => {
    const referencias = arquivosFonte(join(raiz, 'src'))
      .filter((arquivo) => !arquivo.endsWith(ESTE_TESTE))
      .flatMap((arquivo) => {
        const conteudo = readFileSync(arquivo, 'utf8');
        return REFERENCIAS_PROIBIDAS
          .filter((referencia) => conteudo.includes(referencia))
          .map((referencia) => `${relative(raiz, arquivo)} -> ${referencia}`);
      });

    expect(referencias).toEqual([]);
  });
});
