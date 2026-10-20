import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * F99 · TL-051 — registro do changelog do módulo Multiplix.
 *
 * O plano de finalização do Multiplix exige o changelog do módulo versionado e
 * registrado no índice da documentação, e o grafo do repositório gerado no HEAD
 * **sem tratar grafo ausente como código morto** (`docs/multiplix/
 * PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`, F99/E001).
 *
 * Este contrato segura o registro no lugar:
 *  - o arquivo do módulo existe e é um registro datado;
 *  - **todo caminho citado nas entradas existe no repositório** (coerência da
 *    fixture: entrada que aponta para artefato inexistente é o defeito aqui);
 *  - o índice (`docs/README.md`) e o `CHANGELOG.md` da raiz apontam para ele;
 *  - a entrada do grafo declara a receita e a natureza LOCAL do artefato
 *    (`graphify-out/` é gitignored), com as duas fontes independentes lidas do
 *    repositório (`.gitignore` e o manifesto de evidência do grafo), e não
 *    afirma o grafo como versionado.
 *
 * `graphify-out/` é artefato local, não versionado: os caminhos sob ele são
 * excluídos da checagem de existência (num checkout limpo, como no CI, ele não
 * existe por desenho).
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANGELOG_MODULO = 'docs/multiplix/CHANGELOG_MULTIPLIX.md';
const INDICE = 'docs/README.md';
const CHANGELOG_RAIZ = 'CHANGELOG.md';
const MANIFESTO_GRAFO = 'docs/reconciliation/evidence/graphify_evidence_manifest.json';

const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');
const existe = (rel: string) => existsSync(join(RAIZ, rel));

/** Caminhos de arquivo citados em `code spans` (aceita sufixo `:linha`). */
function caminhosCitados(texto: string): string[] {
  const spans = texto.match(/`[^`\n]+`/g) ?? [];
  const caminhos = new Set<string>();
  for (const bruto of spans) {
    const valor = bruto.slice(1, -1).replace(/:\d+$/, '');
    if (/^[\w./-]+\.(md|ts|tsx|sh|mjs|py|json|json\.gz|sql|yml)$/.test(valor)) {
      caminhos.add(valor);
    }
  }
  return [...caminhos];
}

describe('registro do changelog do módulo Multiplix (F99/TL-051)', () => {
  it('o changelog do módulo existe e é um registro datado', () => {
    expect(existe(CHANGELOG_MODULO), `${CHANGELOG_MODULO} não existe`).toBe(true);

    const texto = ler(CHANGELOG_MODULO);
    const entradas = texto.split('\n').filter((linha) => linha.startsWith('- '));
    expect(entradas.length).toBeGreaterThan(0);
    for (const entrada of entradas) {
      expect(entrada, entrada).toMatch(/^- \d{4}-\d{2}-\d{2} · /);
    }
  });

  it('todo caminho citado nas entradas existe no repositório', () => {
    const citados = caminhosCitados(ler(CHANGELOG_MODULO)).filter(
      (caminho) => !caminho.startsWith('graphify-out/'),
    );
    expect(citados.length).toBeGreaterThan(0);

    const ausentes = citados.filter((caminho) => !existe(caminho));
    expect(ausentes, `citados e inexistentes: ${ausentes.join(', ')}`).toEqual([]);
  });

  it('está registrado no índice da documentação e o link do módulo resolve', () => {
    const indice = ler(INDICE);
    expect(indice).toContain('(./multiplix/CHANGELOG_MULTIPLIX.md)');

    const linksDoModulo = [...indice.matchAll(/\]\(\.\/(multiplix\/[^)]+)\)/g)].map(
      (achado) => `docs/${achado[1]}`,
    );
    expect(linksDoModulo.length).toBeGreaterThan(0);
    for (const alvo of linksDoModulo) {
      expect(existe(alvo), `${alvo} referenciado no índice e ausente`).toBe(true);
    }
  });

  it('o CHANGELOG.md da raiz aponta para o changelog do módulo', () => {
    expect(ler(CHANGELOG_RAIZ)).toContain(CHANGELOG_MODULO);
  });

  it('o grafo (E001) é registrado como artefato local regenerável, não como prova de código morto', () => {
    const texto = ler(CHANGELOG_MODULO);

    // Fonte independente 1: `graphify-out/` não é versionado.
    expect(ler('.gitignore')).toMatch(/^graphify-out\/$/m);

    // Fonte independente 2: o manifesto de evidência do grafo declara o limite da extração AST.
    const manifesto = JSON.parse(ler(MANIFESTO_GRAFO)) as { limitations: string[] };
    expect(manifesto.limitations.join(' ')).toMatch(/dead code/i);

    const entradaGrafo = texto.split('\n').find(
      (linha) => linha.startsWith('- ') && linha.includes('E001'),
    );
    expect(entradaGrafo, 'entrada E001 ausente no changelog do módulo').toBeDefined();
    expect(entradaGrafo!).toContain('graphify update . --force');
    expect(entradaGrafo!).toContain('GRAPH_REPORT.md');
    expect(entradaGrafo!).toMatch(/gitignored|não versionado|regenerável/);
    expect(entradaGrafo!).toContain(MANIFESTO_GRAFO);

    // Nenhuma linha afirma o grafo como versionado/commitado sem a negação explícita.
    const linhasDoGrafo = texto
      .split('\n')
      .filter((linha) => /GRAPH_REPORT\.md|graphify-out\//.test(linha));
    expect(linhasDoGrafo.length).toBeGreaterThan(0);
    for (const linha of linhasDoGrafo) {
      if (/(commitad|versionad)/i.test(linha)) {
        expect(linha, linha).toMatch(/não|nao|sem |nunca/i);
      }
    }
  });
});
