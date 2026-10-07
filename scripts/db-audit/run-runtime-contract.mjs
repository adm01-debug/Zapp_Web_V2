// E62 + R2-INF-004: executor do contrato de runtime.
//
// O passo "Provar estado runtime antes do push" do db-migrate.yml tinha um braco de
// `case` por versao de migration. O E62 tirou os bracos do YAML e os guardou em
// `scripts/db-audit/contracts/<versao>.sql`, deixando este executor no lugar deles.
//
// DEFEITO (R2-INF-004, P1, auditoria de 03/10/2026): os arquivos de contrato guardam o
// braco INTEIRO -- texto de shell, `RUNTIME=$(node scripts/db-audit/psql-safe.mjs ... -c "`
// -- e a primeira versao deste executor passava esse texto a psql via `-c`, como se
// fosse SQL. Consequencia: a rota "Provar estado runtime antes do push" NUNCA produzia a
// prova JSON (o psql recusa texto de shell) e, para as versoes sem arquivo dedicado, o
// executor saia com codigo 2 antes de qualquer fallback -- embora o workflow tenha o ramo
// `proof.contract === 'generic'` esperando exatamente o contrato generico.
//
// O que este executor faz:
//   1. le o texto DECLARADO do contrato e dele EXTRAI, explicitamente, os flags do
//      cliente e o SQL -- inline (`-c "<sql>"`) ou em arquivo (`-f <caminho>`). Qualquer
//      outra forma e recusada: shell nunca chega ao psql (fail-closed).
//   2. mapeia versao -> invocacao pela mesma rotulagem do `case` de origem, inclusive os
//      rotulos que agrupam varias versoes e o ramo generico `*)`.
//   3. versao sem contrato dedicado cai no contrato generico
//      (`scripts/db-audit/generic-migration-runtime.sql`) -- o fallback que o workflow ja
//      valida em `proof.contract === 'generic'` e que cobre o inventario do preflight.
//
// FAIL-CLOSED continua sendo requisito, nao detalhe: contrato ilegivel, forma nao
// declarada ou SQL que pareca shell abortam com saida != 0 e nada em stdout. Versao sem
// contrato dedicado NAO vira "nada a verificar" -- vira o contrato generico.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, 'contracts');
const PSQL_SAFE = join(AQUI, 'psql-safe.mjs');

// Rotulo de um braco do `case` de origem: `20260909230000)` ou o agrupamento
// `20260909220000|20260909240000|...)` ou o fallback `*)`.
const ROTULO = /^\s*(?:(\d{14}(?:\|\d{14})*)\)|\*\))\s*$/;
// A chamada declarada do cliente dentro do braco.
const CHAMADA = /^\s*RUNTIME=\$\(\s*node\s+(\S+)\s+(.*)$/;
// Flags aceitos: exatamente o conjunto usado pelos contratos de origem. Qualquer outro
// token (shell, redirecionamento, `--file=`, ...) e recusado antes de virar argv.
const FLAGS_ACEITOS = new Set(['-X', '-q', '-A', '-At', '-t', '-v', 'ON_ERROR_STOP=1']);

export function caminhoDoContrato(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) {
    throw new Error(`versao alvo invalida: "${versao}" (esperado 14 digitos)`);
  }
  return join(dir, `${v}.sql`);
}

// Texto declarado do contrato, como extraido do workflow (E62). Nao e SQL: quem executa
// e `resolverInvocacao`, que extrai dele o SQL e os flags.
export function lerContrato(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    // Fail-closed: nunca devolver vazio como se estivesse tudo certo.
    throw new Error(`contrato de runtime ausente para a versao ${versao}: ${arquivo}`);
  }
  const sql = readFileSync(arquivo, 'utf8');
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return sql;
}

function validarFlags(tokens, origem) {
  if (tokens.length === 0) throw new Error(`contrato ${origem}: chamada sem flags de cliente`);
  const juntos = tokens.join(' ');
  if (!/(^|\s)-v\s+ON_ERROR_STOP=1(\s|$)/.test(juntos)) {
    throw new Error(`contrato ${origem}: falta -v ON_ERROR_STOP=1 (o SQL falharia em silencio)`);
  }
  for (const token of tokens) {
    if (!FLAGS_ACEITOS.has(token)) {
      throw new Error(`contrato ${origem}: flag nao declarada "${token}"`);
    }
  }
  return tokens;
}

function validarSql(sql, origem) {
  const texto = String(sql).trim();
  if (!texto) throw new Error(`contrato ${origem}: -c sem SQL`);
  if (/\$\(|\$\{|`|RUNTIME=/.test(texto)) {
    throw new Error(`contrato ${origem}: o texto de -c tem substituicao de shell; nao e SQL`);
  }
  if (!/^(WITH|SELECT|VALUES)\b/i.test(texto)) {
    throw new Error(`contrato ${origem}: o texto de -c nao comeca por WITH/SELECT/VALUES`);
  }
  return texto;
}

/**
 * Le um contrato declarado e devolve as invocacoes que ele declara, na ordem.
 * Cada invocacao: { versoes: string[]|null, generico: boolean, flags: string[],
 *                   sql: string|null, arquivo: string|null, script: string }.
 * `versoes` e null apenas no ramo generico (`*)`).
 */
export function extrairInvocacoes(texto, versaoDoArquivo, origem = '<contrato>') {
  const linhas = String(texto).split('\n');
  const invocacoes = [];
  let rotulo = null;
  let rotuloPendente = false;
  let primeira = true;

  for (let i = 0; i < linhas.length; i += 1) {
    const casouRotulo = ROTULO.exec(linhas[i]);
    if (casouRotulo) {
      rotulo = casouRotulo[1] ? casouRotulo[1].split('|') : null;
      rotuloPendente = true;
      continue;
    }
    const chamada = CHAMADA.exec(linhas[i]);
    if (!chamada) continue;

    const script = chamada[1];
    const resto = chamada[2];
    let flags;
    let sql = null;
    let arquivo = null;

    const inline = /^(.*?)-c\s+"\s*$/.exec(resto);
    if (inline) {
      flags = inline[1].trim();
      const corpo = [];
      let j = i + 1;
      for (; j < linhas.length; j += 1) {
        const fecha = /^([\s\S]*)"\)\s*$/.exec(linhas[j]);
        if (fecha) {
          corpo.push(fecha[1]);
          break;
        }
        corpo.push(linhas[j]);
      }
      if (j >= linhas.length) {
        throw new Error(`contrato ${origem}: -c " sem fechamento )\"`);
      }
      sql = validarSql(corpo.join('\n'), origem);
      i = j;
    } else if (/\\\s*$/.test(resto)) {
      flags = resto.replace(/\\\s*$/, '').trim();
      const continuacao = linhas[i + 1] ?? '';
      const usaArquivo = /^\s*-f\s+(\S+)\)\s*$/.exec(continuacao);
      if (!usaArquivo) {
        throw new Error(`contrato ${origem}: continuacao sem "-f <arquivo>)"`);
      }
      arquivo = usaArquivo[1];
      if (!/\.sql$/.test(arquivo)) {
        throw new Error(`contrato ${origem}: arquivo de contrato nao termina em .sql ("${arquivo}")`);
      }
      i += 1;
    } else {
      throw new Error(
        `contrato ${origem}: forma nao declarada em "${linhas[i].trim()}" (espere -c "<sql>" ou -f <arquivo>)`,
      );
    }

    const flagsValidos = validarFlags(flags.split(/\s+/).filter(Boolean), origem);

    let versoes;
    if (rotuloPendente) {
      versoes = rotulo;
    } else if (primeira) {
      versoes = [versaoDoArquivo];
    } else {
      throw new Error(`contrato ${origem}: invocacao sem rotulo do case nem versao no nome do arquivo`);
    }

    invocacoes.push({ versoes, generico: rotuloPendente && rotulo === null, flags: flagsValidos, sql, arquivo, script });
    primeira = false;
    rotuloPendente = false;
    rotulo = null;
  }

  return invocacoes;
}

/** Mapa versao -> invocacao dedicada + a invocacao do ramo generico (`*)`). */
export function invocacoesDosContratos(dir = CONTRATOS) {
  const mapa = new Map();
  let generico = null;
  const arquivos = readdirSync(dir).filter((f) => /^\d{14}\.sql$/.test(f)).sort();
  if (arquivos.length === 0) throw new Error(`nenhum contrato de runtime em ${dir}`);

  for (const arquivo of arquivos) {
    const versao = arquivo.replace(/\.sql$/, '');
    const texto = readFileSync(join(dir, arquivo), 'utf8');
    const invocacoes = extrairInvocacoes(texto, versao, arquivo);
    if (invocacoes.length === 0) {
      throw new Error(`contrato ${arquivo}: nenhuma invocacao declarada`);
    }
    for (const invocacao of invocacoes) {
      if (invocacao.generico) {
        if (generico) throw new Error('contrato: mais de um ramo generico (*) declarado');
        generico = invocacao;
        continue;
      }
      for (const v of invocacao.versoes) {
        if (mapa.has(v)) throw new Error(`contrato: a versao ${v} esta declarada em mais de um contrato`);
        mapa.set(v, invocacao);
      }
    }
  }

  if (!generico) {
    throw new Error('contrato: nenhum ramo generico (*) declarado (nao ha fallback para o inventario)');
  }
  return { mapa, generico };
}

/**
 * Invocacao que atende a versao alvo: a dedicada, se declarada; senao o contrato
 * generico (com `generico: true`). Formato da versao invalido aborta.
 */
export function resolverInvocacao(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) {
    throw new Error(`versao alvo invalida: "${versao}" (esperado 14 digitos)`);
  }
  const { mapa, generico } = invocacoesDosContratos(dir);
  if (mapa.has(v)) return { ...mapa.get(v), generico: false };
  return { ...generico, generico: true };
}

function principal(argv) {
  const versao = argv[2];
  let invocacao;
  try {
    invocacao = resolverInvocacao(versao);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(2);
  }

  if (invocacao.arquivo && !existsSync(invocacao.arquivo)) {
    console.error(`::error::contrato de runtime ausente no disco: ${invocacao.arquivo}`);
    process.exit(2);
  }
  if (invocacao.generico) {
    // stderr de proposito: o stdout e o JSON da prova, que o workflow faz JSON.parse.
    console.error(`Sem contrato dedicado para ${versao}; usando o contrato runtime generico.`);
  }

  const args = invocacao.arquivo
    ? [...invocacao.flags, '-f', invocacao.arquivo]
    : [...invocacao.flags, '-c', invocacao.sql];

  const r = spawnSync(process.execPath, [PSQL_SAFE, ...args], { encoding: 'utf8' });
  if (r.error) {
    console.error(`::error::falha ao executar psql-safe: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(r.stderr || `::error::psql-safe saiu com ${r.status}`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(r.stdout);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal(process.argv);
