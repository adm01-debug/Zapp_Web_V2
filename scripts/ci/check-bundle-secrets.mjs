#!/usr/bin/env node
// Guarda que o bundle publicado (dist/) nao expoe o JWT service_role do
// Supabase. Incidente de 20/08 (porta da V3): a variavel de ambiente errada
// injetou a chave service_role no bundle e ela foi servida ao navegador.
// A V2 tem gitleaks (segredo em commit), check-supabase-url-import-meta.mjs
// (intencao em src/) e bundle-budget.mjs (tamanho do bundle); nenhuma olha o
// CONTEUDO do artefato publicado. Um import indireto, um alias ou uma lib de
// terceiros podem levar a chave para dentro do JS minificado sem aparecer como
// leitura literal em src/.
//
// O que ela faz:
//   1. varre todo .js/.mjs/.cjs de dist/, extrai cada token JWT ("eyJ..."),
//      decodifica SO o payload (base64url) e reprova role=service_role.
//      A chave anon (role=anon) PODE estar no bundle — e o que o Vite injeta.
//   2. le .env.production (versionado) e reprova qualquer JWT cujo `role` NAO
//      seja `anon`: no arquivo so e aceita a chave publica.
//
// NUNCA imprime o valor da chave: a violacao sai como arquivo:linha + o claim
// `role` encontrado.
//
// Fail-closed: dist ausente OU sem nenhum .js/.mjs/.cjs sai != 0 (varredura que
// nao leu arquivo nenhum nao pode se declarar OK).
//
// Pós-deploy (opcional no cartao): rodar a mesma varredura no site publicado.
// Nao implementado aqui de proposito — este script nao toca a rede.
//
// Uso:
//   node scripts/ci/check-bundle-secrets.mjs [--dist dist] [--env .env.production]

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTENSOES = ['.js', '.mjs', '.cjs'];

// JWT = "eyJ" + base64url "." base64url "." base64url. O lookbehind impede casar
// um "eyJ" que seja o inicio de uma sequencia base64url maior (ex.: um hash
// colado antes do token), em vez de confiar so no \b (que casa com "_").
const RE_JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu;

/** Extrai os tokens JWT ("eyJ...") de um texto. */
export function extrairTokens(texto) {
  return [...texto.matchAll(RE_JWT)].map((m) => m[0]);
}

/** Decodifica SO o payload (base64url) do JWT; devolve null se nao for um JWT valido. */
export function decodificarPayload(token) {
  const partes = token.split('.');
  if (partes.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Retorna true se o nome e de um arquivo varrido (.js/.mjs/.cjs). */
export function ehArquivoVarrido(nome) {
  return EXTENSOES.some((ext) => nome.endsWith(ext));
}

/** Lista recursivamente os .js/.mjs/.cjs de um diretorio (sourcemaps fora). */
export function listarArquivosVarridos(dir) {
  const arquivos = [];
  const percorrer = (atual) => {
    const entradas = readdirSync(atual, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entrada of entradas) {
      const caminho = path.join(atual, entrada.name);
      if (entrada.isDirectory()) percorrer(caminho);
      else if (entrada.isFile() && ehArquivoVarrido(entrada.name)) arquivos.push(caminho);
    }
  };
  percorrer(dir);
  return arquivos;
}

/** Varre dist/ e devolve os JWTs com role=service_role (o que nao pode publicar). */
export function varrer(distDir) {
  const violacoes = [];
  for (const arquivo of listarArquivosVarridos(distDir)) {
    const conteudo = readFileSync(arquivo, 'utf8');
    conteudo.split(/\r?\n/u).forEach((linha, indice) => {
      for (const token of extrairTokens(linha)) {
        const payload = decodificarPayload(token);
        if (payload?.role === 'service_role') {
          violacoes.push({ arquivo, linha: indice + 1, tipo: 'bundle', role: 'service_role' });
        }
      }
    });
  }
  return violacoes;
}

/** Le .env.production e devolve todo JWT cujo role NAO seja anon. */
export function varrerEnv(caminhoEnv) {
  if (!existsSync(caminhoEnv) || !statSync(caminhoEnv).isFile()) return [];
  const violacoes = [];
  readFileSync(caminhoEnv, 'utf8')
    .split(/\r?\n/u)
    .forEach((linha, indice) => {
      for (const token of extrairTokens(linha)) {
        const payload = decodificarPayload(token);
        const role = payload?.role;
        if (role !== 'anon') {
          violacoes.push({ arquivo: caminhoEnv, linha: indice + 1, tipo: 'env', role: role ?? 'ausente' });
        }
      }
    });
  return violacoes;
}

/** Formata as violacoes em uma linha legivel cada (nunca imprime o token). */
export function avaliar(violacoes) {
  return violacoes.map((v) =>
    v.tipo === 'bundle'
      ? `${v.arquivo}:${v.linha} — JWT com role=service_role no bundle publicado`
      : `${v.arquivo}:${v.linha} — JWT em .env.production com role=${v.role} (so a chave anon e aceita)`,
  );
}

/** Avalia o bundle e o .env.production reais: varre + formata. */
export function guarda(distDir, caminhoEnv = '.env.production') {
  return avaliar([...varrer(distDir), ...varrerEnv(caminhoEnv)]);
}

function parseArgs(argv) {
  const args = { dist: 'dist', env: '.env.production' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dist') args.dist = argv[++i];
    else if (argv[i] === '--env') args.env = argv[++i];
    else throw new Error(`Argumento desconhecido: ${argv[i]}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (erro) {
    console.error(`ERRO: ${erro.message}`);
    return 2;
  }
  const distDir = path.resolve(root, args.dist);
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`ERRO: ${distDir} nao existe. Rode o build antes de verificar o bundle.`);
    return 2;
  }
  const arquivos = listarArquivosVarridos(distDir);
  if (arquivos.length === 0) {
    console.error(
      `ERRO: ${distDir} nao tem nenhum arquivo .js/.mjs/.cjs — a varredura nao leu nada e nao pode se declarar OK (fail-closed).`,
    );
    return 2;
  }
  const caminhoEnv = path.resolve(root, args.env);
  const listadas = avaliar([...varrer(distDir), ...varrerEnv(caminhoEnv)]);
  if (listadas.length > 0) {
    console.error('VIOLACAO: o bundle publicado expoe chave secreta do Supabase\n');
    for (const v of listadas) console.error(` - ${v}`);
    console.error(
      `\n${listadas.length} ocorrencia(s). A chave service_role nunca vai para o cliente: use a anon/publica (VITE_SUPABASE_PUBLISHABLE_KEY) e reconstrua o bundle.`,
    );
    return 1;
  }
  console.log(
    `OK: nenhum JWT service_role no bundle (${arquivos.length} arquivo(s) .js/.mjs/.cjs varrido(s)) e .env.production so com chave anon.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main());
}
