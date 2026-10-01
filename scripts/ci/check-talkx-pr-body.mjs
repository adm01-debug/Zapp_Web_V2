#!/usr/bin/env node
/**
 * Verifica a "definição de pronto" no corpo da PR de cada etapa do plano V4
 * (X005). Quando o título da PR termina em `(X<NNN>)`, exige no corpo as seções
 * `## Etapa`, `## Fecha`, `## Evidência`, `## Print` (se a etapa tem tela),
 * `## Banco` e `## Edge`; caso contrário o verificador não se aplica.
 *
 * Lê só o título e o corpo da PR — nunca secrets nem o banco. Em CI, o job
 * injeta `github.event.pull_request.title/.body` nas variáveis PR_TITLE/PR_BODY.
 *
 * Uso local (teste):
 *   PR_TITLE='fix(x): ... (X006)' PR_BODY="$(cat corpo.md)" node scripts/ci/check-talkx-pr-body.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ETAPAS_JSON = 'docs/talkx/v4/etapas.json';

/** Extrai o id `X<NNN>` do título, ou null se a PR não é de uma etapa V4. */
export function etapaIdDoTitulo(titulo) {
  const m = /\(X([0-9]{3})\)/u.exec(titulo ?? '');
  return m ? `X${m[1]}` : null;
}

/** Devolve o conteúdo sob o cabeçalho `## <nome>`, ou null se a seção não existe. */
export function secao(corpo, nome) {
  const linhas = (corpo ?? '').split(/\r?\n/u);
  const inicio = linhas.findIndex((l) => new RegExp(`^##\\s*${nome}\\s*$`, 'u').test(l));
  if (inicio === -1) return null;
  let fim = linhas.findIndex((l, i) => i > inicio && /^##\s/u.test(l));
  if (fim === -1) fim = linhas.length;
  return linhas.slice(inicio + 1, fim).join('\n').trim();
}

/** A etapa toca alguma das 17 telas visuais (01–17)? "motor"/"dados"/"—" não contam. */
export function temTelaVisual(tela) {
  return /(?:0[1-9]|1[0-7])/.test(tela ?? '');
}

/**
 * Valida o corpo contra a etapa do plano.
 * Retorna { aplica, violacoes }. `aplica === false` quando o título não é de
 * uma etapa V4 (o verificador não se aplica e a PR passa sem as seções).
 */
export function verificarCorpo({ titulo, corpo, etapa }) {
  const id = etapaIdDoTitulo(titulo);
  if (!id) return { aplica: false, violacoes: [] };
  if (!etapa) return { aplica: true, violacoes: [`etapa ${id} não existe no plano (${ETAPAS_JSON})`] };

  const violacoes = [];

  const secEtapa = secao(corpo, 'Etapa');
  if (secEtapa == null) violacoes.push('seção "## Etapa" ausente');
  else if (!secEtapa.includes(id)) violacoes.push(`"## Etapa" não cita ${id}`);
  else if (!secEtapa.includes(etapa.titulo)) violacoes.push('"## Etapa" título difere do plano');

  const secFecha = secao(corpo, 'Fecha');
  if (secFecha == null) violacoes.push('seção "## Fecha" ausente');
  else {
    for (const fid of etapa.fecha ?? []) {
      if (!secFecha.includes(fid)) violacoes.push(`"## Fecha" não cita ${fid}`);
    }
  }

  const secEv = secao(corpo, 'Evidência');
  if (secEv == null) violacoes.push('seção "## Evidência" ausente');
  else if (!secEv) violacoes.push('"## Evidência" vazia');

  if (temTelaVisual(etapa.tela)) {
    const secPrint = secao(corpo, 'Print');
    if (secPrint == null) violacoes.push('seção "## Print" ausente (etapa com tela)');
    else if (!secPrint) violacoes.push('"## Print" vazia (etapa com tela)');
  }

  const secBanco = secao(corpo, 'Banco');
  if (secBanco == null) violacoes.push('seção "## Banco" ausente');
  else if (etapa.ddl && (!secBanco || /sem\s*ddl/i.test(secBanco))) {
    violacoes.push('"## Banco" vazio ou "sem DDL" numa etapa com DDL (exigido: versão da migration + aplicada/ledger)');
  }

  const secEdge = secao(corpo, 'Edge');
  if (secEdge == null) violacoes.push('seção "## Edge" ausente');
  else if (etapa.edge && (!secEdge || /sem\s*edge/i.test(secEdge))) {
    violacoes.push('"## Edge" vazio ou "sem edge" numa etapa que implanta edge (exigido: run do deploy-functions.yml ou "aguardando aprovação")');
  }

  return { aplica: true, violacoes };
}

export function carregarEtapas(raiz) {
  return JSON.parse(readFileSync(join(raiz, ETAPAS_JSON), 'utf8'));
}

function main() {
  const root = resolve(import.meta.dirname, '../..');
  const titulo = process.env.PR_TITLE ?? '';
  const corpo = process.env.PR_BODY ?? '';

  const id = etapaIdDoTitulo(titulo);
  if (!id) {
    console.log('não se aplica: o título não é de uma etapa V4 (sem "(X<NNN>)").');
    return;
  }

  const etapas = carregarEtapas(root);
  const etapa = etapas.find((e) => e.id === id);
  const { violacoes } = verificarCorpo({ titulo, corpo, etapa });

  if (violacoes.length > 0) {
    for (const v of violacoes) console.error(`ERRO: ${v}`);
    console.error(`Corpo da PR de ${id} não cumpre a definição de pronto (X005).`);
    console.error('Seções exigidas: ## Etapa, ## Fecha, ## Evidência, ## Print (se tela), ## Banco, ## Edge.');
    process.exitCode = 1;
    return;
  }

  console.log(`OK: corpo da PR ${id} cumpre a definição de pronto.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main();
}
