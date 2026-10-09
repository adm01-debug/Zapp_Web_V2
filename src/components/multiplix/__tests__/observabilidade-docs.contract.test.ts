import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * F91 (TL-049) — Observabilidade do Multiplix: os dois documentos que o item exige.
 *
 * O que este contrato prova (e que faltava antes dele):
 *   1. `docs/runbooks/multiplix-incidentes.md` existe e cobre os SEIS cenários do F91
 *      (fila travada, worker morto, TTS fora, conexão caída, consumo estourado, Singu
 *      indisponível), cada um com AÇÃO e DONO — alerta sem dono não é alerta.
 *   2. `docs/INCIDENT-RUNBOOK.md` aponta para esse runbook (era o critério do item:
 *      "referenciado em INCIDENT-RUNBOOK.md").
 *   3. `docs/runbooks/slo.md` traz as SEIS métricas do F91 (tempo de fila, falhas por
 *      classe, latência de voz, consumo estimado × real, não conciliados, conexão em
 *      risco), com dono e ação por linha.
 *   4. O rastreio por `correlation_id` do clique ao envio está documentado com a fonte
 *      real (`multiplix_events.correlation_id`) — o runbook não pode mandar ninguém
 *      procurar um id que não existe no banco.
 *
 * Doc não tem "comportamento" para testar; o contrato aqui é de CONTEÚDO: sem a seção
 * ou sem o dono, a operação não sabe o que fazer quando o alerta toca.
 */

const RUNBOOK_INCIDENTES = 'docs/runbooks/multiplix-incidentes.md';
const SLO = 'docs/runbooks/slo.md';
const INCIDENT_RUNBOOK = 'docs/INCIDENT-RUNBOOK.md';

const CENARIOS_F91 = [
  'Fila travada',
  'Worker morto',
  'TTS fora',
  'Conexão caída',
  'Consumo estourado',
  'Singu indisponível',
] as const;

const METRICAS_F91 = [
  'Tempo de fila',
  'Falhas por classe',
  'Latência de voz',
  'Consumo estimado × real',
  'Não conciliados',
  'Conexão em risco',
] as const;

const read = (path: string) => readFileSync(path, 'utf8');

/** Recorta a seção do slo.md que começa no cabeçalho dado e termina no próximo `## `. */
function secao(doc: string, cabecalho: string): string {
  const inicio = doc.indexOf(cabecalho);
  if (inicio < 0) return '';
  const resto = doc.slice(inicio + cabecalho.length);
  const fim = resto.search(/^## /m);
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe('F91/TL-049 — observabilidade do Multiplix (docs)', () => {
  it('o runbook de incidentes do Multiplix existe', () => {
    expect(existsSync(RUNBOOK_INCIDENTES), `${RUNBOOK_INCIDENTES} não existe`).toBe(true);
  });

  it('o INCIDENT-RUNBOOK referencia o runbook do Multiplix', () => {
    expect(read(INCIDENT_RUNBOOK)).toContain('docs/runbooks/multiplix-incidentes.md');
  });

  it('o runbook cobre os seis cenários do F91, cada um com ação e dono', () => {
    const doc = read(RUNBOOK_INCIDENTES);
    for (const cenario of CENARIOS_F91) {
      expect(doc, `cenário ausente no runbook: ${cenario}`).toContain(cenario);
    }
    const acoes = doc.match(/\*\*Ação:\*\*/g)?.length ?? 0;
    const donos = doc.match(/\*\*Dono:\*\*/g)?.length ?? 0;
    expect(acoes, 'cenário sem AÇÃO não é acionável').toBeGreaterThanOrEqual(CENARIOS_F91.length);
    expect(donos, 'cenário sem DONO não é acionável').toBeGreaterThanOrEqual(CENARIOS_F91.length);
  });

  it('o runbook documenta o rastreio por correlation_id com a fonte real no banco', () => {
    const doc = read(RUNBOOK_INCIDENTES);
    // O id do clique vive em multiplix_events (F34/F43); mandar procurar em outro lugar
    // seria pior que não documentar.
    expect(doc).toContain('correlation_id');
    expect(doc).toContain('multiplix_events');
  });

  it('o slo.md traz as seis métricas do Multiplix com dono e ação por linha', () => {
    const doc = read(SLO);
    const secaoMetricas = secao(doc, '### Métricas do Multiplix');
    expect(secaoMetricas, 'seção "### Métricas do Multiplix" ausente no slo.md').not.toBe('');

    for (const metrica of METRICAS_F91) {
      expect(secaoMetricas, `métrica ausente no slo.md: ${metrica}`).toContain(metrica);
    }

    // Tabela com dono e ação: sem as duas colunas, a métrica não tem responsável.
    const linhas = secaoMetricas.split('\n').filter((l) => l.trim().startsWith('|'));
    const dados = linhas.filter((l) => !/^\|\s*-+/.test(l.trim()) && !/Dono/.test(l));
    expect(dados.length, 'a tabela de métricas precisa das seis linhas de dado').toBeGreaterThanOrEqual(
      METRICAS_F91.length,
    );
    expect(secaoMetricas).toContain('Dono');
    expect(secaoMetricas).toContain('Ação');
  });
});
