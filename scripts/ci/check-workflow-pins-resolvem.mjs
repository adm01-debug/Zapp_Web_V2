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

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PIN = /uses:\s*([\w.-]+\/[\w.-]+)(?:\/[^@\s]+)?@([0-9a-f]{40})(?:\s*#\s*(\S+))?/g;

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
      problemas.push(`${pin.repo} ${pin.tag} (${onde}): não foi possível consultar a tag (${erro.message})`);
      continue;
    }
    const real = commitDaTag(saida, pin.tag);
    if (!real) problemas.push(`${pin.repo} ${pin.tag} (${onde}): a tag não existe no repositório da Action`);
    else if (real !== pin.sha) problemas.push(`${pin.repo} ${pin.tag} (${onde}): pin ${pin.sha} ≠ commit real da tag ${real}`);
  }
  return problemas;
}

function lsRemoteGit(repo, tag) {
  const args = ['ls-remote', '--tags', `https://github.com/${repo}`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`];
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      return execFileSync('git', args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw new Error(String(ultimoErro?.stderr || ultimoErro?.message || 'falha').trim().split('\n')[0]);
}

async function main() {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const arquivos = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
  const pins = coletarPins(arquivos);
  const problemas = await verificarPins(pins, async (repo, tag) => lsRemoteGit(repo, tag));
  if (problemas.length) {
    for (const p of problemas) console.error(`::error::${p}`);
    console.error(`FALHA: ${problemas.length} de ${pins.length} pins não correspondem ao commit real da tag declarada.`);
    process.exit(1);
  }
  console.log(`OK: ${pins.length} pins conferidos — cada SHA é o commit real da tag do comentário.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
