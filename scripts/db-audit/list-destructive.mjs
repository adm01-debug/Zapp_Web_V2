// GA17 (plano 2026-10-15): portao de migration destrutiva no preflight.
//
// O sql-lexer ja torna comentarios, strings e corpos dollar-quoted opacos
// (stripSqlComments troca tudo por espaco, sem colar tokens). Sobre o texto
// projetado, cada statement (separado por `;`) e classificado pela cabeca:
//
//   DROP ...                  qualquer DROP (tabela, coluna via ALTER, funcao...)
//   REVOKE ...                retirada de privilegio muda o plano de acesso
//   TRUNCATE ...              apaga todas as linhas fora de transacao visivel
//   DELETE FROM ...           DML destrutiva em migration versionada
//   ALTER ... DROP COLUMN|CONSTRAINT (coberto pelo DROP generico acima)
//
// Fail-closed: arquivo ilegivel ou fora de forma => exit 2, nunca "limpo".
// Linha reportada e aproximada (comentarios/strings multilinha viram um
// espaco so e deslocam a contagem); o `trecho` e a evidencia para o revisor.

import { readFileSync } from 'node:fs';
import { stripSqlComments } from './sql-lexer.mjs';

const RE_DESTRUTIVO = /^\s*(DROP\s|REVOKE\s|TRUNCATE\s|DELETE\s+FROM\b)/i;
// ALTER so e destrutivo quando derruba coluna ou constraint (o plano cita
// `ALTER … DROP`); um ALTER ADD COLUMN e rotina e nao pode barrar o lote.
const RE_ALTER = /^\s*ALTER\b/i;
const RE_ALTER_DROP = /\bDROP\s+(COLUMN|CONSTRAINT)\b/i;

/**
 * @param {string} sql texto da migration
 * @returns {{ linha: number, tipo: string, trecho: string }[]}
 */
export function listarDestrutivos(sql) {
  const projetado = stripSqlComments(String(sql ?? ''));
  const achados = [];
  let offset = 0;
  for (const parte of projetado.split(';')) {
    const m = RE_DESTRUTIVO.exec(parte);
    let tipo = m ? m[1].trim().split(/\s+/)[0].toUpperCase() : null;
    if (!tipo && RE_ALTER.test(parte) && RE_ALTER_DROP.test(parte)) tipo = 'DROP';
    if (tipo) {
      const cabeca = parte.trim().slice(0, 120).replace(/\s+/g, ' ');
      const linha = projetado.slice(0, offset).split('\n').length;
      achados.push({ linha, tipo, trecho: cabeca });
    }
    offset += parte.length + 1;
  }
  return achados;
}

/** @param {string} sql */
export function haDestrutivo(sql) {
  return listarDestrutivos(sql).length > 0;
}

/**
 * GA17: verifica se toda versao destrutiva foi confirmada pelo operador.
 * @param {string} necessarias csv de versions com DDL/DML destrutivo
 * @param {string} confirmadas csv de `confirm_destructive`
 * @returns {string[]} versions sem confirmacao
 */
export function faltandoConfirmacao(necessarias, confirmadas) {
  const nec = String(necessarias ?? '').split(',').filter(Boolean);
  const conf = new Set(String(confirmadas ?? '').split(',').filter(Boolean));
  return nec.filter((v) => !conf.has(v));
}

// CLI (usado pelo preflight do db-migrate.yml):
//   --arquivo <sql> [--versao]: exit 0 limpo, 1 destrutivo, 2 erro.
//   --confirmar <necessarias-csv> --com <confirmadas-csv>: exit 0 confirmado, 1 falta, 2 uso.
if (process.argv[1]?.endsWith('list-destructive.mjs')) {
  const args = process.argv.slice(2);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const uso = () => {
    console.error('uso: node scripts/db-audit/list-destructive.mjs --arquivo <migration.sql> [--versao <14digitos>]');
    console.error('     node scripts/db-audit/list-destructive.mjs --confirmar <necessarias-csv> --com <confirmadas-csv>');
  };
  if (args.includes('--confirmar')) {
    const faltam = faltandoConfirmacao(valor('--confirmar') ?? '', valor('--com') ?? '');
    if (faltam.length) {
      console.error(`::error::Apply com DDL/DML destrutivo exige confirm_destructive com: ${valor('--confirmar')}. Sem confirmacao: ${faltam.join(',')}.`);
      process.exit(1);
    }
    console.log('OK: DDL destrutivo confirmado.');
    process.exit(0);
  }
  const arquivo = valor('--arquivo');
  const versao = valor('--versao') ?? '?';
  if (!arquivo) {
    uso();
    process.exit(2);
  }
  let sql;
  try {
    sql = readFileSync(arquivo, 'utf8');
  } catch (e) {
    console.error(`::error::nao foi possivel ler ${arquivo}: ${e.message}`);
    process.exit(2);
  }
  const achados = listarDestrutivos(sql);
  if (achados.length === 0) {
    console.log(`OK: ${versao} sem DDL/DML destrutivo.`);
    process.exit(0);
  }
  for (const a of achados) {
    console.log(`::warning::${versao} ${a.tipo} (linha ~${a.linha}): ${a.trecho}`);
  }
  console.error(`::error::${versao} contem ${achados.length} statement(s) destrutivo(s); confirme com confirm_destructive=${versao}.`);
  process.exit(1);
}
