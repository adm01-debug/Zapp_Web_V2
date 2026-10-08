import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SL-093 — Bloco 06 (IA-051..IA-060): observabilidade, custos e resultados de
 * negócio. O item de origem (inventário de 07/10/2026, "Bloco 06 (051-060)")
 * dizia: "IA-058 só em projeto; IA-057/059/060 sem evidência".
 *
 * Este contrato fecha a parte de EVIDÊNCIA do bloco: o índice da IA declara o
 * estado REAL de cada etapa na ponta do dia, e cada arquivo citado como prova
 * precisa existir no repositório. O que só existe como projeto ou intenção é
 * nomeado como tal — nunca omitido nem contado como entregue, para o bloco não
 * ser lido como concluído (a mesma regra do contrato da IA-058).
 *
 * A asserção casa a ENTRADA do índice que começa com a etapa (a linha e a sua
 * continuação) e cruza o caminho da evidência com o disco — prosa solta não
 * satisfaz o contrato.
 */
const README = readFileSync(resolve(process.cwd(), 'docs/ia/README.md'), 'utf8');
const LINHAS = README.split('\n');

/** Entrada do índice que começa com a etapa (ex.: "- **IA-057 —"): linha + continuação. */
function entradaDaEtapa(etapa: string): string {
  const inicio = LINHAS.findIndex(l => new RegExp(`^\\s*-\\s*\\*\\*${etapa}\\b`).test(l));
  if (inicio === -1) return '';
  const entrada: string[] = [LINHAS[inicio]];
  for (let i = inicio + 1; i < LINHAS.length; i++) {
    const linha = LINHAS[i];
    if (linha.trim() === '' || /^\s*-\s*\*\*/.test(linha) || /^#/.test(linha)) break;
    entrada.push(linha);
  }
  return entrada.join('\n');
}

const ETAPAS_DO_BLOCO = [
  'IA-051',
  'IA-052',
  'IA-053',
  'IA-054',
  'IA-055',
  'IA-056',
  'IA-057',
  'IA-058',
  'IA-059',
  'IA-060',
];

/**
 * Provas que o índice cita. Precisam existir de fato — se uma migration for
 * removida e o índice continuar afirmando "implementada", o contrato cai.
 */
const EVIDENCIAS_DO_BLOCO = [
  'supabase/migrations/20261002611230_ia051_correlacao_de_execucao.sql',
  'supabase/migrations/20261003082707_ia055_tarifas_versionadas.sql',
  'supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql',
  'supabase/migrations/20261003072707_ia056_agregacao_no_servidor.sql',
  'src/components/settings/ai-providers/AIProviderHealthPanel.tsx',
  'tests/contracts/ia057-indicadores-de-saude.test.ts',
];

describe('SL-093 — Bloco 06: estado declarado das etapas IA-051..IA-060', () => {
  it('declara a seção de estado das etapas do Bloco 06', () => {
    expect(
      README,
      'o índice da IA precisa de uma seção com o estado das etapas do Bloco 06',
    ).toMatch(/Bloco 06[^\n]{0,80}estado das etapas/i);
  });

  it.each(ETAPAS_DO_BLOCO)('declara o estado da etapa %s', etapa => {
    expect(
      entradaDaEtapa(etapa),
      `o índice precisa declarar o estado de ${etapa} (IMPLEMENTADA, DESIGN_ONLY ou NÃO IMPLEMENTADA)`,
    ).toMatch(/\b(IMPLEMENTADA|DESIGN_ONLY|N[ÃA]O IMPLEMENTADA)\b/i);
  });

  it('IA-057 aponta a prova do painel de saúde (código, não projeto)', () => {
    const entrada = entradaDaEtapa('IA-057');
    expect(entrada, 'IA-057 é uma correção entregue em código').toMatch(/\bIMPLEMENTADA\b/i);
    expect(entrada, 'a prova da IA-057 é o painel de saúde dos provedores').toMatch(
      /AIProviderHealthPanel/,
    );
  });

  it('IA-059 e IA-060 estão nomeadas como NÃO IMPLEMENTADAS (nada de omitir)', () => {
    for (const etapa of ['IA-059', 'IA-060']) {
      expect(
        entradaDaEtapa(etapa),
        `${etapa} não tem implementação no repositório: o índice precisa dizer isso`,
      ).toMatch(/N[ÃA]O IMPLEMENTADA/i);
    }
  });

  it('IA-059 nomeia o que falta (redação de conteúdo sensível no log de IA)', () => {
    expect(entradaDaEtapa('IA-059')).toMatch(/sens[íi]vel|redig|reda[çc][ãa]o/i);
  });

  it('IA-060 nomeia o que falta (medição de utilidade da assistência)', () => {
    expect(entradaDaEtapa('IA-060')).toMatch(/utilidade|aceita[çc][ãa]o|retrabalho/i);
  });

  it.each(EVIDENCIAS_DO_BLOCO)('a evidência citada existe no repositório: %s', caminho => {
    expect(README, `o índice precisa citar ${caminho}`).toContain(caminho);
    expect(existsSync(resolve(process.cwd(), caminho)), `${caminho} precisa existir`).toBe(true);
  });

  it('não afirma o Bloco 06 concluído', () => {
    expect(
      README,
      'o Bloco 06 tem etapas não implementadas (IA-059/IA-060) e não pode constar como concluído',
    ).not.toMatch(/Bloco 06[^\n]{0,60}conclu[íi]d/i);
  });
});
