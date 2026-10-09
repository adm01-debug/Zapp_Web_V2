import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato do runbook da REVISÃO DE 7 DIAS pós-go-live (item 100 do plano de migração).
 *
 * O passo 100 do `docs/migration/PLANO.md` é o fechamento operacional da migração:
 * revisar 7 dias de logs, cron, webhooks e custo. Ele não é verificável em código —
 * o que sobra é atividade operacional, de produção, do dono (Joaquim). O que o
 * cartão precisa deixar no repositório é o PROCEDIMENTO: sem ele, cada leitura de
 * 7 dias começa do zero e a evidência não é comparável.
 *
 * Este contrato trava três coisas no runbook:
 *  1. os quatro eixos do título existem como seções (logs, cron, webhooks, custo);
 *  2. todo caminho de repositório citado em `code` existe de verdade (nenhuma
 *     referência quebrada é aceita);
 *  3. o dono e o perímetro estão declarados: produção é leitura e é do Joaquim —
 *     agente não executa.
 */

const RUNBOOK = 'docs/runbooks/revisao-7-dias-pos-go-live.md';

/** Tokens entre crases que apontam para caminhos do repositório (o resto é SQL/JS). */
const PREFIXOS = ['scripts/', 'docs/', 'supabase/', 'src/', '.github/', 'tests/', 'e2e/'];

function texto(): string {
  expect(existsSync(RUNBOOK), `runbook ausente: ${RUNBOOK}`).toBe(true);
  return readFileSync(RUNBOOK, 'utf8');
}

function caminhosCitados(md: string): string[] {
  const tokens = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  return [...new Set(tokens)].filter((t) =>
    PREFIXOS.some((p) => t.startsWith(p)) && !t.includes(' ') && !t.includes('*'),
  );
}

describe('runbook da revisão de 7 dias pós-go-live', () => {
  const md = texto();

  it('cobre os quatro eixos do cartão como seções próprias', () => {
    const secoes = [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
    expect(secoes.length, 'o runbook precisa de seções `## `').toBeGreaterThanOrEqual(4);
    for (const [eixo, re] of [
      ['logs', /log/i],
      ['cron', /cron|agendad/i],
      ['webhooks', /webhook/i],
      ['custo', /custo/i],
    ] as const) {
      expect(
        secoes.some((s) => re.test(s)),
        `o eixo "${eixo}" precisa de uma seção própria`,
      ).toBe(true);
    }
  });

  it('não cita caminho de repositório que não existe', () => {
    const citados = caminhosCitados(md);
    expect(citados.length, 'o runbook precisa citar as fontes de evidência').toBeGreaterThan(4);
    const quebrados = citados.filter((c) => !existsSync(c));
    expect(quebrados, `caminhos citados que não existem: ${quebrados.join(', ')}`).toEqual([]);
  });

  it('declara o dono e o perímetro: produção é leitura e não é do agente', () => {
    expect(md, 'precisa nomear o dono').toMatch(/Joaquim/);
    expect(md, 'precisa declarar que é somente leitura').toMatch(/somente leitura|leitura apenas/i);
    expect(md, 'precisa dizer que agente não executa em produção').toMatch(
      /agente[^.\n]{0,80}(n[ãa]o|nunca)/i,
    );
  });

  it('aponta a origem do item (passo 100 do plano de migração)', () => {
    expect(md).toMatch(/docs\/migration\/PLANO\.md/);
    expect(md, 'precisa citar o passo 100').toMatch(/100/);
  });
});
