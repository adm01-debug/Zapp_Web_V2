#!/usr/bin/env node
// E82: redige o relatório do Playwright ANTES de virar artifact.
//
// `::add-mask::` protege o LOG do run -- não o arquivo. Dois motivos, ambos medidos:
//  * o `playwright-report` é HTML com o e-mail do usuário de teste gravado dentro
//    (título de teste, argumento do fill(), URL);
//  * e, pior, o motivo registrado em `scripts/ci/check-e2e-artifact-secrets.mjs`: quando
//    o `auth.setup` falha, o Playwright grava a árvore de acessibilidade em
//    `test-results/.../error-context.md` e o relatório embute esse conteúdo -- o campo de
//    SENHA aparece com o valor digitado em texto claro.
//
// Ou seja: redigir só o e-mail não resolve. Este script aceita VÁRIOS segredos
// (--segredo-env repetido) e o e2e-logado.yml passa as duas credenciais de E2E.
//
// O valor do segredo chega SEMPRE pelo nome da variável de ambiente, nunca pela linha de
// comando: argumento de processo aparece no `ps` e no log de erro. A saída imprime só
// contagens -- o valor não é ecoado nem quando substituído.

//
// W06 (15/10/2026): redigir só os arquivos de TEXTO soltos não bastava. O relatório HTML
// guarda os dados dos testes num ZIP em base64 embutido no `index.html`
// (`data:application/zip;base64,...`) e os traces ficam em `data/*.zip`; o título do passo
// `Fill "<valor>"` vai nos dois. Medido nos artifacts dos runs 38703841548, 38760211564 e
// 38773362900: o `.md` saía redigido e a SENHA seguia em texto claro dentro do ZIP
// embutido. Por isso o script agora abre os ZIPs (inclusive o embutido e os aninhados),
// redige byte a byte, regrava, e no fim VERIFICA o diretório inteiro: se sobrar uma
// ocorrência em qualquer lugar legível, sai com erro e o upload não acontece.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

// Valor curto demais não é tratado como segredo: substituir uma string de 1-4 caracteres
// corromperia o relatório inteiro sem proteger nada.
export const TAMANHO_MINIMO = 5;

// GA38: JWTs aparecem em traces/reports do E2E sem serem passados como --segredo-env
// (cabeçalho Authorization, campo access_token, etc.). Padrão: eyJ<header>.<payload>.<sig>
export const RE_JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu;

const BINARIOS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.woff', '.woff2', '.ttf', '.ico', '.pdf']);

export function extensaoDe(caminho) {
  const ponto = caminho.lastIndexOf('.');
  return ponto === -1 ? '' : caminho.slice(ponto).toLowerCase();
}

/** Aceita um segredo ou uma lista; descarta vazios, curtos demais e repetidos. */
export function normalizarSegredos(segredos) {
  const lista = (Array.isArray(segredos) ? segredos : [segredos]).filter(
    (s) => typeof s === 'string' && s.length >= TAMANHO_MINIMO,
  );
  return [...new Set(lista)];
}

/** Todos os arquivos de texto sob `dir`, recursivo. Binário fica de fora. */
export function arquivosDeTexto(dir) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      continue; // diretório ausente ou sem permissão: não é motivo para derrubar o CI
    }
    for (const entrada of entradas) {
      const caminho = join(atual, entrada.name);
      if (entrada.isDirectory()) pilha.push(caminho);
      else if (entrada.isFile() && !BINARIOS.has(extensaoDe(caminho))) saida.push(caminho);
    }
  }
  return saida.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Redige todos os segredos da lista, numa passada só por arquivo. */
export function redigirConteudo(texto, segredos) {
  let saida = texto;
  let ocorrencias = 0;
  for (const segredo of normalizarSegredos(segredos)) {
    const partes = saida.split(segredo);
    ocorrencias += partes.length - 1;
    saida = partes.join('[redigido]');
  }
  // GA38: JWT automático — não depende de --segredo-env (Authorization Bearer, access_token…)
  saida = saida.replace(/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu, () => {
    ocorrencias += 1;
    return '[redigido]';
  });
  return { texto: saida, ocorrencias };
}

// ── Bytes e ZIP ──────────────────────────────────────────────────────────────
// O segredo pode aparecer escapado: JSON (`\"`, `\\`) no report.json e nos traces, HTML
// (`&amp;`, `&quot;`...) no index.html. Cada forma é redigida.
export function formasDoSegredo(segredo) {
  const json = JSON.stringify(segredo).slice(1, -1);
  const html = segredo
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  return [...new Set([segredo, json, html])];
}

const REDIGIDO = Buffer.from('[redigido]');

/** Troca o segredo nos BYTES: serve para texto e não corrompe binário ao redor. */
export function redigirBytes(buffer, segredos) {
  let saida = buffer;
  let ocorrencias = 0;
  for (const segredo of normalizarSegredos(segredos)) {
    for (const forma of formasDoSegredo(segredo)) {
      const agulha = Buffer.from(forma);
      if (saida.indexOf(agulha) === -1) continue;
      const partes = [];
      let inicio = 0;
      let achado = saida.indexOf(agulha, inicio);
      while (achado !== -1) {
        partes.push(saida.subarray(inicio, achado), REDIGIDO);
        ocorrencias += 1;
        inicio = achado + agulha.length;
        achado = saida.indexOf(agulha, inicio);
      }
      partes.push(saida.subarray(inicio));
      saida = Buffer.concat(partes);
    }
  }
  // GA38: JWT em entradas de ZIP (JSON de network, traces…). latin1 é bijeção: cada byte
  // vira exatamente um char e volta — sem perda. Bytes > 127 não casam com [A-Za-z0-9_-].
  if (saida.includes(Buffer.from('eyJ'))) {
    const texto = saida.toString('latin1');
    let n = 0;
    const redigido = texto.replace(
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu,
      () => { n += 1; return '[redigido]'; },
    );
    if (n > 0) {
      saida = Buffer.from(redigido, 'latin1');
      ocorrencias += n;
    }
  }
  return { buffer: saida, ocorrencias };
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = TABELA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Lê as entradas de um ZIP (central directory). Falha FECHADO -- lança -- em tudo que
 * não sabe regravar com segurança: ZIP64, criptografia, método diferente de stored/deflate.
 * Quem chama trata o erro como "redação falhou" e o artifact não sobe.
 */
export function lerZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('zip sem end of central directory');
  const total = buffer.readUInt16LE(eocd + 10);
  const tamanhoCd = buffer.readUInt32LE(eocd + 12);
  const inicioCd = buffer.readUInt32LE(eocd + 16);
  if (total === 0xffff || tamanhoCd === 0xffffffff || inicioCd === 0xffffffff) {
    throw new Error('zip64 nao suportado');
  }
  const entradas = [];
  let p = inicioCd;
  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('central directory corrompido');
    const flags = buffer.readUInt16LE(p + 8);
    const metodo = buffer.readUInt16LE(p + 10);
    const tamanhoComprimido = buffer.readUInt32LE(p + 20);
    const tamanhoNome = buffer.readUInt16LE(p + 28);
    const tamanhoExtra = buffer.readUInt16LE(p + 30);
    const tamanhoComentario = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    if (flags & 0x1) throw new Error('zip criptografado nao suportado');
    if (metodo !== 0 && metodo !== 8) throw new Error(`metodo de compressao ${metodo} nao suportado`);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('local header corrompido');
    const inicioDados = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const comprimido = buffer.subarray(inicioDados, inicioDados + tamanhoComprimido);
    entradas.push({
      nome: buffer.subarray(p + 46, p + 46 + tamanhoNome),
      flags: flags & ~0x8, // sem data descriptor na regravação: tamanhos vão no header
      metodo,
      hora: buffer.readUInt16LE(p + 12),
      data: buffer.readUInt16LE(p + 14),
      crc: buffer.readUInt32LE(p + 16),
      tamanho: buffer.readUInt32LE(p + 24),
      versaoFeita: buffer.readUInt16LE(p + 4),
      atributosInternos: buffer.readUInt16LE(p + 36),
      atributosExternos: buffer.readUInt32LE(p + 38),
      comprimido,
      conteudo: () => (metodo === 0 ? Buffer.from(comprimido) : inflateRawSync(comprimido)),
    });
    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

/** Regrava um ZIP a partir das entradas (as alteradas vêm com `novoConteudo`). */
export function escreverZip(entradas) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const e of entradas) {
    let { metodo, crc, tamanho, comprimido } = e;
    if (e.novoConteudo) {
      metodo = 8;
      crc = crc32(e.novoConteudo);
      tamanho = e.novoConteudo.length;
      comprimido = deflateRawSync(e.novoConteudo);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(e.hora, 10);
    local.writeUInt16LE(e.data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(tamanho, 22);
    local.writeUInt16LE(e.nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, e.nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.versaoFeita, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.flags, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(e.hora, 12);
    central.writeUInt16LE(e.data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(tamanho, 24);
    central.writeUInt16LE(e.nome.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(e.atributosInternos, 36);
    central.writeUInt32LE(e.atributosExternos, 38);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, e.nome);
    deslocamento += 30 + e.nome.length + comprimido.length;
  }
  const cd = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(cd.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, cd, fim]);
}

/** Redige dentro de um ZIP, recursivo para ZIP aninhado. Só regrava se mudou algo. */
export function redigirZip(buffer, segredos) {
  const entradas = lerZip(buffer);
  let ocorrencias = 0;
  for (const e of entradas) {
    const conteudo = e.conteudo();
    const r = extensaoDe(e.nome.toString('utf8')) === '.zip'
      ? redigirZip(conteudo, segredos)
      : redigirBytes(conteudo, segredos);
    if (r.ocorrencias === 0) continue;
    e.novoConteudo = r.buffer;
    ocorrencias += r.ocorrencias;
  }
  return { buffer: ocorrencias === 0 ? buffer : escreverZip(entradas), ocorrencias };
}

// O relatório HTML do Playwright embute os dados (report.json + um JSON por arquivo de
// teste) como ZIP em base64 dentro do index.html.
const ZIP_EMBUTIDO = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;

/** Redige o texto E os ZIPs em base64 embutidos nele. */
export function redigirTextoComZipEmbutido(texto, segredos) {
  let ocorrencias = 0;
  const comZip = texto.replace(ZIP_EMBUTIDO, (inteiro, b64) => {
    const r = redigirZip(Buffer.from(b64, 'base64'), segredos);
    if (r.ocorrencias === 0) return inteiro;
    ocorrencias += r.ocorrencias;
    return `data:application/zip;base64,${r.buffer.toString('base64')}`;
  });
  const r = redigirConteudo(comZip, segredos);
  // redigirConteudo cobre só a forma literal; as escapadas (JSON/HTML) passam aqui.
  const b = redigirBytes(Buffer.from(r.texto, 'utf8'), segredos);
  return { texto: b.buffer.toString('utf8'), ocorrencias: ocorrencias + r.ocorrencias + b.ocorrencias };
}

/** ZIPs soltos sob `dir` (traces do Playwright em `data/*.zip`). */
export function arquivosZip(dir) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      const caminho = join(atual, entrada.name);
      if (entrada.isDirectory()) pilha.push(caminho);
      else if (entrada.isFile() && extensaoDe(caminho) === '.zip') saida.push(caminho);
    }
  }
  return saida.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Redige os arquivos de texto (com os ZIPs embutidos) e os ZIPs soltos sob `dir`.
 * Devolve só contagens. ZIP que não dá para regravar com segurança LANÇA: o chamador
 * sai com erro e o upload, condicionado ao sucesso da redação, não acontece.
 */
export function redigirDiretorio(dir, segredos) {
  const textos = arquivosDeTexto(dir);
  const zips = arquivosZip(dir);
  const lista = normalizarSegredos(segredos);
  let arquivosTocados = 0;
  let ocorrencias = 0;
  for (const caminho of textos) {
    let original;
    try {
      original = readFileSync(caminho, 'utf8');
    } catch {
      continue;
    }
    const { texto, ocorrencias: n } = redigirTextoComZipEmbutido(original, lista);
    if (n === 0) continue;
    writeFileSync(caminho, texto);
    arquivosTocados += 1;
    ocorrencias += n;
  }
  for (const caminho of zips) {
    const r = redigirZip(readFileSync(caminho), lista);
    if (r.ocorrencias === 0) continue;
    writeFileSync(caminho, r.buffer);
    arquivosTocados += 1;
    ocorrencias += r.ocorrencias;
  }
  return { arquivos: textos.length + zips.length, arquivosTocados, ocorrencias, segredos: lista.length };
}

/** Quantas ocorrências SOBRARAM sob `dir` (texto, ZIP embutido e ZIP solto). */
export function contarRestantes(dir, segredos) {
  const lista = normalizarSegredos(segredos);
  let restantes = 0;
  for (const caminho of arquivosDeTexto(dir)) {
    restantes += redigirTextoComZipEmbutido(readFileSync(caminho, 'utf8'), lista).ocorrencias;
  }
  for (const caminho of arquivosZip(dir)) {
    restantes += redigirZip(readFileSync(caminho), lista).ocorrencias;
  }
  return restantes;
}

function principal(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  const nomes = argv
    .filter((a) => a.startsWith('--segredo-env='))
    .map((a) => a.slice('--segredo-env='.length))
    .filter(Boolean);
  if (!dir || nomes.length === 0) {
    console.error('uso: redigir-relatorio.mjs <dir> --segredo-env=NOME [--segredo-env=OUTRO]');
    return 2;
  }
  const valores = [];
  const ignorados = [];
  for (const nome of nomes) {
    const valor = process.env[nome];
    // Sem o valor não há o que redigir. Falhar aqui derrubaria o E2E por causa de um
    // secret não configurado -- e o artifact tem `if-no-files-found: ignore`. O nome da
    // variável, esse sim, vai para o log: ajuda a diagnosticar sem expor nada.
    if (!valor) ignorados.push(`${nome} (vazio)`);
    else if (valor.length < TAMANHO_MINIMO) ignorados.push(`${nome} (curto demais)`);
    else valores.push(valor);
  }
  if (ignorados.length > 0) console.log(`aviso: ignorado(s): ${ignorados.join(', ')}`);
  if (valores.length === 0) {
    console.log('aviso: nenhum segredo utilizavel - nada a redigir');
    return 0;
  }
  if (!statSync(dir, { throwIfNoEntry: false })) {
    console.log(`aviso: ${dir} nao existe - nada a redigir`);
    return 0;
  }
  let r;
  try {
    r = redigirDiretorio(dir, valores);
  } catch (err) {
    // Sem detalhe do conteúdo: só o tipo do problema (zip64, método, corrompido).
    console.error(`erro: redacao falhou (${err instanceof Error ? err.message : 'desconhecido'}) - o relatorio NAO deve subir`);
    return 1;
  }
  console.log(
    `redigido: ${r.ocorrencias} ocorrencia(s) de ${r.segredos} segredo(s) em ` +
      `${r.arquivosTocados} de ${r.arquivos} arquivo(s)`,
  );
  const restantes = contarRestantes(dir, valores);
  if (restantes > 0) {
    console.error(`erro: ${restantes} ocorrencia(s) sobreviveram a redacao - o relatorio NAO deve subir`);
    return 1;
  }
  console.log('verificado: nenhuma ocorrencia restante (texto, zip embutido e zip solto)');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(principal(process.argv.slice(2)));
}
