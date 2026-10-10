import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IA-057 — aceite: "nenhum provedor recebe 100% de sucesso por ausencia de
 * observacoes". O defeito original estava em AIProviderHealthPanel.tsx:53
 * (`stats.total > 0 ? ... : 100`), que pintava o icone de verde sem amostra.
 *
 * As assercoes olham CODIGO, nao prosa: comentario que EXPLICA o defeito nao
 * pode fazer o teste passar nem falhar.
 */
const semComentarios = (fonte: string) =>
  fonte
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

const PAINEL = semComentarios(
  readFileSync(resolve(process.cwd(), 'src/components/settings/ai-providers/AIProviderHealthPanel.tsx'), 'utf8'),
);

describe('IA-057 — sem observacao nao existe indicador', () => {
  it('a taxa de sucesso e nula quando nao ha observacao (nunca 100)', () => {
    expect(PAINEL).toMatch(/taxaDeSucesso\s*=\s*total > 0 \? Math\.round\(\(sucessos \/ total\) \* 100\) : null/);
    // o defeito nao pode voltar em nenhuma forma
    expect(PAINEL).not.toMatch(/:\s*100\s*;/);
    expect(PAINEL).not.toMatch(/\?\s*100\s*:/);
  });

  it('sem observacao o painel nao mostra KPI nenhum, e diz que nao ha dados', () => {
    expect(PAINEL).toMatch(/if \(total === 0\)/);
    expect(PAINEL).toMatch(/sem dados/i);
    // o early-return do vazio tem de vir ANTES do grid de KPI
    const posVazio = PAINEL.indexOf('if (total === 0)');
    const posKpis = PAINEL.indexOf('{kpis.map(');
    expect(posVazio).toBeGreaterThan(-1);
    expect(posKpis).toBeGreaterThan(posVazio);
  });

  it('taxa e disponibilidade sao indicadores separados, com denominador visivel', () => {
    expect(PAINEL).toMatch(/'Taxa de Sucesso'/);
    expect(PAINEL).toMatch(/'Disponibilidade'/);
    expect(PAINEL).toMatch(/comDesfechoProprio\s*=\s*sucessos \+ falhas/);
    // fallback NAO pode entrar como indisponibilidade
    expect(PAINEL).not.toMatch(/comDesfechoProprio\s*=\s*sucessos \+ falhas \+ recuperadasPorFallback/);
  });

  it('recuperacao por fallback e contada separada dos erros', () => {
    expect(PAINEL).toMatch(/recuperadasPorFallback\s*=\s*recentLogs\.filter\(l => l\.status === 'fallback'\)/);
    expect(PAINEL).toMatch(/falhas\s*=\s*recentLogs\.filter\(l => l\.status === 'error'\)/);
    expect(PAINEL).toMatch(/'Recuperadas por fallback'/);
    expect(PAINEL).toMatch(/'Erros'/);
  });

  it('p50 e p95 existem e so usam duracao MEDIDA', () => {
    expect(PAINEL).toMatch(/percentil\(duracoes, 0\.5\)/);
    expect(PAINEL).toMatch(/percentil\(duracoes, 0\.95\)/);
    // duracao nao medida nao pode virar zero
    expect(PAINEL).not.toMatch(/duration_ms \|\| 0/);
    expect(PAINEL).toMatch(/typeof d === 'number' && Number\.isFinite\(d\)/);
    // e a quantidade nao medida e declarada
    expect(PAINEL).toMatch(/semMedicaoDeDuracao/);
    expect(PAINEL).toMatch(/sem medi[cç][aã]o/i);
  });

  it('a janela da amostra e declarada e aplicada na consulta', () => {
    expect(PAINEL).toMatch(/HORAS_DA_JANELA/);
    expect(PAINEL).toMatch(/\.gte\('created_at', desde\)/);
    expect(PAINEL).toMatch(/amostra de \{total\} chamadas/);
  });

  it('percentil de lista vazia e nulo, nao zero', () => {
    expect(PAINEL).toMatch(/if \(valores\.length === 0\) return null/);
  });

  it('nenhum indicador sem amostra usa cor de sucesso', () => {
    // a cor/icone de sucesso so aparece quando ha valor medido
    expect(PAINEL).toMatch(/v === null \? 'text-muted-foreground'/);
    expect(PAINEL).toMatch(/v === null \? MinusCircle/);
    expect(PAINEL).toMatch(/taxaDeSucesso === null \? '—'/);
  });
});
