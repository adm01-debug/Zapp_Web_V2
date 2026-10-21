#!/usr/bin/env node
/**
 * GA22 / GA24 — explica objetos divergentes do catalogo por migrations do repo.
 *
 * Problema (plano GA20-GA25, 15/10/2026):
 * - GA22: o auto-merge da PR de sync "legalizava" sozinho DDL feito por fora
 *   (objeto existe no banco mas nenhuma migration do repo o cria).
 * - GA24: o db-live-guard abria issue ate para divergencia que e so o lote
 *   ainda nao sincronizado (apply feito, PR de sync ainda nao mergeada).
 *
 * O que este script faz: compara o catalogo base x novo e exige que todo
 * objeto ADICIONADO (tabela/view/funcao/enum, coluna nova, assinatura nova)
 * seja mencionado em pelo menos um arquivo .sql de migration do repo.
 * Remocao e assunto do Gate 3 (check-remocoes-destrutivas.mjs), nao daqui.
 *
 * Roda OFFLINE, sem credencial. Contrato de saida:
 *   0 = todo objeto novo/alterado explicado por migration (pode auto-merge /
 *       pode tratar como "sync pendente" neutro)
 *   1 = ha objeto sem nenhuma migration que o mencione (DDL por fora)
 *   2 = erro de entrada
 *
 * Uso:
 *   node scripts/db-audit/drift-explicado.mjs \
 *     --base supabase/schema-catalog.json --novo /tmp/catalog.new.json \
 *     [--migrations-dir supabase/migrations] [--versions 20261020120000,...]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function lerJson(arquivo) {
  if (!fs.existsSync(arquivo)) {
    console.error('ERRO: arquivo nao encontrado: ' + arquivo);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    console.error('ERRO: JSON invalido (' + arquivo + '): ' + error.message);
    process.exit(2);
  }
}

function comoLista(valor) {
  return Array.isArray(valor) ? valor.map(String) : [];
}

/** Unidades adicionadas no novo em relacao ao base. */
export function diferenca(base, novo) {
  const unidades = [];
  const conjunto = (valor) => new Set(comoLista(valor));
  for (const [campo, kind] of [['tables', 'tabela'], ['views', 'view'], ['functions', 'funcao'], ['enums', 'enum']]) {
    const antes = conjunto(base[campo]);
    for (const nome of conjunto(novo[campo])) {
      if (!antes.has(nome)) unidades.push({ kind, nome });
    }
  }
  // Colunas: entradas 'rel.col:tipo:nul' presentes so no novo, cuja relacao
  // nao e ela mesma nova (nesse caso a tabela ja e a unidade explicada).
  const relacoesNovas = new Set(
    unidades.filter((u) => u.kind === 'tabela' || u.kind === 'view').map((u) => u.nome),
  );
  const colAntes = new Set(comoLista(base.columns));
  for (const entrada of comoLista(novo.columns)) {
    if (colAntes.has(entrada)) continue;
    const rel = entrada.split('.')[0];
    const col = (entrada.split('.')[1] || '').split(':')[0];
    if (!rel || !col || relacoesNovas.has(rel)) continue;
    unidades.push({ kind: 'coluna', nome: rel + '.' + col, rel, col });
  }
  // Assinaturas: 'nome(args)->ret|kind=f' novas de funcao pre-existente.
  const funcoesNovas = new Set(
    unidades.filter((u) => u.kind === 'funcao').map((u) => u.nome),
  );
  const sigAntes = new Set(comoLista(base.function_signatures));
  for (const sig of comoLista(novo.function_signatures)) {
    if (sigAntes.has(sig)) continue;
    const nome = sig.split('(')[0];
    if (!nome || funcoesNovas.has(nome)) continue;
    unidades.push({ kind: 'assinatura', nome: nome + '()', fn: nome });
  }
  return unidades;
}

export function mencionado(nome, sqlTexto) {
  const alvo = String(nome).toLowerCase();
  const texto = String(sqlTexto || '').toLowerCase().replace(/"/g, '');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp('\\b' + esc(alvo) + '\\b').test(texto)) return true;
  // Nomes de tipos no tsc (Cliente) vs tabelas no SQL (clientes): aceita
  // plural simples, sem virar substring (ped nao explica pedidos).
  const palavras = new Set(texto.split(/[^a-z0-9_]+/));
  if (palavras.has(alvo + 's') || palavras.has(alvo + 'es')) return true;
  if (alvo.endsWith('s') && palavras.has(alvo.slice(0, -1))) return true;
  // Coluna 'rel.col': aceita rel e col citadas separadamente no mesmo arquivo
  // (caso tipico de ALTER TABLE rel ADD COLUMN col).
  if (alvo.includes('.')) {
    const [rel, col] = alvo.split('.');
    if (rel && col && mencionado(rel, texto) && mencionado(col, texto)) return true;
  }
  return false;
}

/** Identificadores citados por erros do tsc (para o Gate 1 pendente, GA23). */
export function identificadoresDoTsc(texto) {
  const ids = new Set();
  const linhas = String(texto || '').split('\n').filter((l) => /error TS\d+/.test(l));
  for (const linha of linhas) {
    const citados = linha.match(/['"`]([^'"`\n]{2,80})['"`]/g) || [];
    for (const citado of citados) {
      const nome = citado.slice(1, -1).replace(/^public\./, '');
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nome)) ids.add(nome);
    }
  }
  return [...ids];
}

function arquivosSql(dir, versions) {
  if (!fs.existsSync(dir)) {
    console.error('ERRO: diretorio de migrations nao encontrado: ' + dir);
    process.exit(2);
  }
  const soVersoes = versions ? new Set(versions.split(',').map((v) => v.trim()).filter(Boolean)) : null;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !soVersoes || soVersoes.has(f.slice(0, 14)))
    .map((f) => path.join(dir, f))
    .sort();
}

export function explicar(unidades, textosSql) {
  const explicados = [];
  const naoExplicados = [];
  for (const u of unidades) {
    const nomes = u.kind === 'coluna' ? [u.nome, u.col] : u.kind === 'assinatura' ? [u.fn] : [u.nome];
    const ok = textosSql.some((sql) => nomes.some((n) => mencionado(n, sql.texto)));
    (ok ? explicados : naoExplicados).push(u);
  }
  return { explicados, naoExplicados };
}

const E_TESTE = process.argv.includes('--para-teste');
if (!E_TESTE && process.argv[1] && process.argv[1].endsWith('drift-explicado.mjs')) {
  const base = lerJson(arg('base') || path.join(ROOT, 'supabase/schema-catalog.json'));
  const novo = lerJson(arg('novo') || '/tmp/catalog.new.json');
  const dir = arg('migrations-dir') || path.join(ROOT, 'supabase/migrations');
  const unidades = diferenca(base, novo);
  if (unidades.length === 0) {
    console.log('OK: nenhum objeto novo/alterado — nada a explicar.');
    process.exit(0);
  }
  const arquivos = arquivosSql(dir, arg('versions'));
  if (arquivos.length === 0) {
    console.error('ERRO: nenhum arquivo de migration considerado; divergeencia nao explicada.');
    process.exit(1);
  }
  const textos = arquivos.map((a) => ({ arquivo: a, texto: fs.readFileSync(a, 'utf8') }));
  const { explicados, naoExplicados } = explicar(unidades, textos);
  for (const u of explicados) console.log('explicado: ' + u.kind + ' ' + u.nome);
  if (naoExplicados.length > 0) {
    for (const u of naoExplicados) console.error('SEM MIGRATION: ' + u.kind + ' ' + u.nome);
    console.error('BLOQUEADO: ' + naoExplicados.length + ' objeto(s) sem migration no repo (DDL por fora).');
    process.exit(1);
  }
  console.log('OK: ' + explicados.length + ' objeto(s) explicados por migration do repo.');
}
