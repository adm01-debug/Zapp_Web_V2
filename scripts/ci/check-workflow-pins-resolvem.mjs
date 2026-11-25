#!/usr/bin/env node
// Todo pin de Action (`owner/repo@<sha40> # vX.Y.Z`) precisa ser o commit REAL da tag
// declarada no comentário.
//
// O check-workflow-pins.mjs confere formato (40 hex, repositório autorizado), mas
// não se o SHA existe. Em 15/10/2026 o scorecard.yml estava com dois pins
// inexistentes desde o lote #1942: `ossf/scorecard-action@f49aabe0…75b3f07db4`
// (o real da v2.4.1 é `f49aabe0…75731b0186` — 32 caracteres iguais, 8 inventados)
// e `github/codeql-action@60168efe…`. O workflow falhava no "Set up job" em todo
// push e nunca produziu um score. Este check fecha essa classe de erro.
//
// Verificação: `git ls-remote --tags https://github.com/<owner>/<repo> vX.Y.Z vX.Y.Z^{}`
// (sem token, um processo por pin único). O SHA tem de ser o commit apontado pela
// tag (o `^{}` quando a tag é anotada). Pin sem comentário de versão reprova: sem
// ele não há o que conferir.
//
// O github.com responde 403 a IP de runner compartilhado em picos: o job 🛡️ Workflow lint
// reprovou a PR #3376 em 25/11/2026 com "unable to access ... returned error: 403" e
// passou no rerun sem nenhuma mudança de código. Falha transitória — 403/429/5xx, DNS,
// timeout, conexão cortada — agora repete com backoff (2 s/6 s/14 s) e, se ainda falhar,
// sai marcada como limite do runner em vez de aparecer como pin errado.

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const PIN = /uses:\s*([\w.-]+\/[\w.-]+)(?:\/[^@\s]+)?@([0-9a-f]{40})(?:\s*#\s*(\S+))?/g;

// Falha de ambiente (limite de IP do runner, DNS, timeout, conexão cortada) não é pin errado:
// vale insistir. Erro definitivo (repositório ou tag inexistente) reprova na primeira tentativa.
const TRANSITORIA = /\b(403|408|429|5\d\d)\b|unable to access|could not resolve host|connection (reset|refused|timed out)|operation timed out|early eof|rpc failed|the remote end hung up|network is unreachable|temporary failure/i;

// Backoff entre tentativas (ms): 4 tentativas no total (a primeira mais três esperas).
export const ESPERA_MS = [2000, 6000, 14000];
// Teto de insistências por execução: um runner limitado por IP falha em TODOS os pins,
// e sem teto 30 pins × 38 s de espera estourariam o timeout do job.
export const MAX_INSISTENCIAS = 3;
export const MARCADOR_TRANSITORIO = 'limite/instabilidade de rede do runner';

export function falhaTransitoria(mensagem) {
  return TRANSITORIA.test(String(mensagem));
}

function textoDoErro(erro) {
  return String(erro?.stderr || erro?.message || 'falha').trim().split('\n').find((linha) => linha.trim()) ?? 'falha';
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function coletarPins(arquivos) {
  const unicos = new Map();
  for (const [nome, texto] of arquivos) {
    for (const m of texto.matchAll(PIN)) {
      const [, repo, sha, tag] = m;
      const chave = `${repo}@${sha}#${tag ?? ''}`;
      if (!unicos.has(chave)) unicos.set(chave, { repo, sha, tag: tag ?? null, arquivos: new Set() });
      unicos.get(chave).arquivos.add(nome);
    }
  }
  return [...unicos.values()];
}

// Saída do ls-remote → SHA do commit da tag (peeled se anotada; o próprio se leve).
export function commitDaTag(saida, tag) {
  let leve = null;
  let peeled = null;
  for (const linha of saida.split('\n')) {
    const [sha, ref] = linha.trim().split(/\s+/);
    if (ref === `refs/tags/${tag}^{}`) peeled = sha;
    else if (ref === `refs/tags/${tag}`) leve = sha;
  }
  return peeled ?? leve;
}

export async function verificarPins(pins, lsRemote) {
  const problemas = [];
  for (const pin of pins) {
    const onde = [...pin.arquivos].sort((a, b) => a.localeCompare(b)).join(', ');
    if (!pin.tag) {
      problemas.push(`${pin.repo}@${pin.sha} (${onde}): pin sem comentário "# vX.Y.Z" — não há tag para conferir`);
      continue;
    }
    let saida;
    try {
      saida = await lsRemote(pin.repo, pin.tag);
    } catch (erro) {
      const rotulo = erro.transitorio ? `${MARCADOR_TRANSITORIO}; ` : '';
      problemas.push(`${pin.repo} ${pin.tag} (${onde}): não foi possível consultar a tag (${rotulo}${erro.message})`);
      continue;
    }
    const real = commitDaTag(saida, pin.tag);
    if (!real) problemas.push(`${pin.repo} ${pin.tag} (${onde}): a tag não existe no repositório da Action`);
    else if (real !== pin.sha) problemas.push(`${pin.repo} ${pin.tag} (${onde}): pin ${pin.sha} ≠ commit real da tag ${real}`);
  }
  return problemas;
}

function executarLsRemote(repo, tag) {
  const args = ['ls-remote', '--tags', `https://github.com/${repo}`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`];
  return execFileSync(resolverExecutavel('git'), args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

// 403/429/5xx de IP de runner é transitório: repete com backoff antes de reprovar.
export async function lsRemoteComRetry(repo, tag, { executar = executarLsRemote, dormir = esperar, orcamento = { restantes: MAX_INSISTENCIAS } } = {}) {
  let ultimoErro;
  for (let indice = 0; indice <= ESPERA_MS.length; indice += 1) {
    try {
      return executar(repo, tag);
    } catch (erro) {
      ultimoErro = erro;
      const mensagemDoErro = textoDoErro(erro);
      const podeInsistir = falhaTransitoria(mensagemDoErro) && indice < ESPERA_MS.length && orcamento.restantes > 0;
      if (!podeInsistir) break;
      orcamento.restantes -= 1;
      await dormir(ESPERA_MS[indice]);
    }
  }
  const mensagem = textoDoErro(ultimoErro);
  const erro = new Error(mensagem);
  erro.transitorio = falhaTransitoria(mensagem);
  throw erro;
}

async function main() {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const arquivos = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
  const pins = coletarPins(arquivos);
  const orcamento = { restantes: MAX_INSISTENCIAS };
  const problemas = await verificarPins(pins, (repo, tag) => lsRemoteComRetry(repo, tag, { orcamento }));
  if (problemas.length) {
    for (const p of problemas) console.error(`::error::${p}`);
    console.error(`FALHA: ${problemas.length} de ${pins.length} pins não passaram na conferência.`);
    const transitorios = problemas.filter((p) => p.includes(MARCADOR_TRANSITORIO)).length;
    if (transitorios) {
      console.error(`NOTA: ${transitorios} de ${problemas.length} falhas foram de ${MARCADOR_TRANSITORIO} (HTTP 403/429/5xx), não de pin errado — reexecute o job antes de mexer em workflow.`);
    }
    process.exit(1);
  }
  console.log(`OK: ${pins.length} pins conferidos — cada SHA é o commit real da tag do comentário.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
