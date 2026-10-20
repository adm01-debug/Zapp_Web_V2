#!/usr/bin/env node
// E87: quarentena formal da suite E2E.
//
// Uma quarentena sem prazo e' um `skip` com outro nome: ninguem revisa, o motivo se
// perde e o teste nunca volta. Este verificador existe para a quarentena ter FIM --
// ele le e2e/quarantine.json e falha quando um item passa do prazo.
//
// CUMPRE DOIS PAPEIS, e os dois importam:
//  1. validar a FORMA dos itens (spec existente, motivo, issue, prazo valido). Item sem
//     motivo e sem issue nao entra: e' o que separa quarentena de esconderijo;
//  2. cobrar o PRAZO. Item vencido derruba o CI -- sem isso, "quarentena" vira o lugar
//     onde o teste quebrado vai para morrer.
//
// Uso: node scripts/ci/check-quarantine.mjs [--hoje=AAAA-MM-DD] [--json]
// O --hoje existe para o teste poder fixar a data; o CI roda sem ele.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, '../..');
export const CAMINHO_PADRAO = 'e2e/quarantine.json';

const CAMPOS_OBRIGATORIOS = ['spec', 'motivo', 'issue', 'prazo'];
const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/u;

/** Data de hoje em ISO, sem depender de fuso do ambiente. */
export function hojeISO(agora = new Date()) {
  return agora.toISOString().slice(0, 10);
}

export function carregarQuarentena(raiz = RAIZ, caminho = CAMINHO_PADRAO) {
  const arquivo = join(raiz, caminho);
  if (!existsSync(arquivo)) {
    // Arquivo ausente nao e' erro: o projeto pode nao ter quarentena nenhuma. Mas o
    // verificador continua rodando, para o dia em que o arquivo existir.
    return { itens: [], avisos: [`${caminho} nao existe -- nada em quarentena`] };
  }
  const cru = JSON.parse(readFileSync(arquivo, 'utf8'));
  const itens = Array.isArray(cru.quarentena) ? cru.quarentena : [];
  return { itens, avisos: [] };
}

/**
 * Valida a forma e cobra o prazo. Devolve a lista de problemas (vazia = tudo certo).
 * Separado em duas funcoes para o teste provar cada regra sozinha.
 */
export function validar(itens, { raiz = RAIZ, hoje = hojeISO() } = {}) {
  const problemas = [];
  for (const item of itens) {
    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => item?.[c] === undefined || item?.[c] === '');
    if (faltando.length > 0) {
      problemas.push(`item sem ${faltando.join(', ')} (spec=${item?.spec ?? '??'})`);
      continue;
    }
    if (!FORMATO_DE_DATA.test(String(item.prazo))) {
      problemas.push(`${item.spec}: prazo "${item.prazo}" nao esta em AAAA-MM-DD`);
      continue;
    }
    if (!existsSync(join(raiz, item.spec))) {
      problemas.push(`${item.spec}: spec em quarentena nao existe no repositorio`);
    }
    if (String(item.prazo) < hoje) {
      problemas.push(
        `${item.spec}: prazo vencido em ${item.prazo} (hoje ${hoje}) -- ` +
          `consertar e tirar da quarentena, ou renovar o prazo com motivo novo (issue #${item.issue})`,
      );
    }
  }
  return problemas;
}

/** Specs que o playwright.config deve ignorar. */
export function specsEmQuarentena(itens) {
  return itens
    .map((i) => i?.spec)
    .filter((s) => typeof s === 'string' && s.length > 0)
    .sort();
}

function principal(argv) {
  const hoje = argv.find((a) => a.startsWith('--hoje='))?.slice('--hoje='.length) ?? hojeISO();
  const { itens, avisos } = carregarQuarentena();
  for (const aviso of avisos) console.log(`aviso: ${aviso}`);
  const problemas = validar(itens, { hoje });
  if (problemas.length > 0) {
    console.error(`check-quarantine: FALHOU -- ${problemas.length} problema(s) na quarentena:`);
    for (const p of problemas) console.error(` - ${p}`);
    return 1;
  }
  console.log(`check-quarantine: OK -- ${itens.length} spec(s) em quarentena, nenhum vencido.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(principal(process.argv.slice(2)));
}
