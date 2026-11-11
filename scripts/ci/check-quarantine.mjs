#!/usr/bin/env node
// E87: quarentena formal da suite E2E.
//
// Uma quarentena sem prazo e' um `skip` com outro nome: ninguem revisa, o motivo se
// perde e o teste nunca volta. Este verificador existe para a quarentena ter FIM --
// ele le e2e/quarantine.js e falha quando um item passa do prazo.
//
// CUMPRE DOIS PAPEIS, e os dois importam:
//  1. validar a FORMA dos itens (spec existente, motivo, issue, prazo valido). Item sem
//     motivo e sem issue nao entra: e' o que separa quarentena de esconderijo;
//  2. cobrar o PRAZO. Item vencido derruba o CI -- sem isso, "quarentena" vira o lugar
//     onde o teste quebrado vai para morrer.
//
// Uso: node scripts/ci/check-quarantine.mjs [--hoje=AAAA-MM-DD] [--json]
// O --hoje existe para o teste poder fixar a data; o CI roda sem ele.

import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, '../..');
export const CAMINHO_PADRAO = 'e2e/quarantine.js';

const CAMPOS_OBRIGATORIOS = ['spec', 'motivo', 'issue', 'prazo'];
const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/u;

function dataISOValida(valor) {
  if (typeof valor !== 'string' || !FORMATO_DE_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function issueValida(valor) {
  return (typeof valor === 'number' || typeof valor === 'string')
    && /^[1-9]\d*$/u.test(String(valor))
    && Number.isSafeInteger(Number(valor));
}

/** Data de hoje em ISO, sem depender de fuso do ambiente. */
export function hojeISO(agora = new Date()) {
  return agora.toISOString().slice(0, 10);
}

export async function carregarQuarentena(raiz = RAIZ, caminho = CAMINHO_PADRAO) {
  const arquivo = join(raiz, caminho);
  if (!existsSync(arquivo)) {
    // Arquivo ausente nao e' erro: o projeto pode nao ter quarentena nenhuma. Mas o
    // verificador continua rodando, para o dia em que o arquivo existir.
    return { itens: [], avisos: [`${caminho} nao existe -- nada em quarentena`] };
  }
  const mod = await import(pathToFileURL(arquivo).href);
  if (!Array.isArray(mod.quarentena)) {
    throw new Error(`${caminho} deve exportar quarentena como lista`);
  }
  return { itens: mod.quarentena, avisos: [] };
}

/**
 * Valida a forma e cobra o prazo. Devolve a lista de problemas (vazia = tudo certo).
 * Separado em duas funcoes para o teste provar cada regra sozinha.
 */
export function validar(itens, { raiz = RAIZ, hoje = hojeISO() } = {}) {
  const problemas = [];
  if (!dataISOValida(hoje)) return [`hoje "${hoje}" nao e uma data valida em AAAA-MM-DD`];
  if (!Array.isArray(itens)) return ['quarentena deve ser uma lista'];
  for (const item of itens) {
    const faltando = CAMPOS_OBRIGATORIOS.filter((c) =>
      item?.[c] == null || (typeof item[c] === 'string' && item[c].trim() === ''));
    if (faltando.length > 0) {
      problemas.push(`item sem ${faltando.join(', ')} (spec=${item?.spec ?? '??'})`);
      continue;
    }
    if (typeof item.motivo !== 'string') {
      problemas.push(`${item.spec}: motivo deve ser texto nao vazio`);
    }
    if (!issueValida(item.issue)) {
      problemas.push(`${item.spec}: issue deve ser um inteiro positivo`);
    }
    if (typeof item.prazo !== 'string' || !FORMATO_DE_DATA.test(item.prazo)) {
      problemas.push(`${item.spec}: prazo "${item.prazo}" nao esta em AAAA-MM-DD`);
      continue;
    }
    if (!dataISOValida(item.prazo)) {
      problemas.push(`${item.spec}: prazo "${item.prazo}" nao e uma data valida em AAAA-MM-DD`);
      continue;
    }
    if (typeof item.spec !== 'string' || isAbsolute(item.spec) || win32.isAbsolute(item.spec)) {
      problemas.push('spec deve ser um caminho relativo de arquivo no repositorio');
    } else {
      const arquivo = resolve(raiz, item.spec);
      const caminhoRelativo = relative(resolve(raiz), arquivo);
      if (caminhoRelativo === '..' || caminhoRelativo.startsWith(`..${sep}`)) {
        problemas.push(`${item.spec}: spec deve ficar dentro do repositorio`);
      } else if (!existsSync(arquivo)) {
        problemas.push(`${item.spec}: spec em quarentena nao existe no repositorio`);
      } else if (!statSync(arquivo).isFile()) {
        problemas.push(`${item.spec}: spec deve ser um arquivo`);
      } else {
        const destinoRelativo = relative(realpathSync(raiz), realpathSync(arquivo));
        if (destinoRelativo === '..' || destinoRelativo.startsWith(`..${sep}`)) {
          problemas.push(`${item.spec}: spec deve ficar dentro do repositorio`);
        }
      }
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

function argumentos(argv) {
  const args = { hoje: hojeISO(), json: false };
  const vistos = new Set();
  for (const argumento of argv) {
    const nome = argumento === '--json' ? 'json' : argumento.startsWith('--hoje=') ? 'hoje' : null;
    if (argumento === '--hoje') throw new Error('argumento incompleto: use --hoje=AAAA-MM-DD');
    if (!nome) throw new Error(`argumento desconhecido: ${argumento}`);
    if (vistos.has(nome)) throw new Error(`argumento repetido: --${nome}`);
    vistos.add(nome);
    if (nome === 'json') args.json = true;
    else args.hoje = argumento.slice('--hoje='.length);
  }
  if (!dataISOValida(args.hoje)) throw new Error(`hoje "${args.hoje}" nao e uma data valida em AAAA-MM-DD`);
  return args;
}

async function principal(argv) {
  let hoje = null;
  let itens = [];
  let avisos = [];
  let problemas = [];
  let codigo = 0;
  try {
    ({ hoje } = argumentos(argv));
  } catch (erro) {
    problemas = [erro.message];
    codigo = 2;
  }
  if (codigo === 0) {
    try {
      ({ itens, avisos } = await carregarQuarentena());
      problemas = validar(itens, { hoje });
    } catch (erro) {
      problemas = [erro.message];
    }
    if (problemas.length > 0) codigo = 1;
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: codigo === 0, hoje, total: itens.length, avisos, problemas }));
    return codigo;
  }
  for (const aviso of avisos) console.log(`aviso: ${aviso}`);
  if (codigo !== 0) {
    console.error(`check-quarantine: FALHOU -- ${problemas.length} problema(s) na quarentena:`);
    for (const p of problemas) console.error(` - ${p}`);
    return codigo;
  }
  console.log(`check-quarantine: OK -- ${itens.length} spec(s) em quarentena, nenhum vencido.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).then((exitCode) => process.exit(exitCode)).catch((erro) => {
    console.error(`check-quarantine: FALHOU -- ${erro.message}`);
    process.exitCode = 1;
  });
}
