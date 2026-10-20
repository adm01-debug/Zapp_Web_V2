#!/usr/bin/env node
/**
 * Lista as permissoes NOMEADAS que a tela usa para esconder acao e diz, para
 * cada uma, se existe trava de verdade no banco — isto e, se alguma migration
 * chama `user_has_permission(<usuario>, '<permissao>')`.
 *
 * Por que existe (cartao N-004 / lacuna L9 de docs/ia/IA-004-matriz-autorizacao.md):
 * a tela esconde botao por permissao, mas esconder botao NAO bloqueia a acao. Hoje
 * so `send_messages` e imposta no servidor — no ponto de entrada do envio, pelas
 * migrations 20260930190000 e 20260930200000. Esta lista mostra, sem tocar no banco
 * de producao, quais permissoes da tela ainda NAO tem trava no banco.
 *
 * Leitura estatica e offline: nada de rede, nada de banco, nada de producao.
 *
 *   FRONT (padrao `src`, so .ts/.tsx; fora de __tests__/, *.test.*, *.spec.*, *.d.ts):
 *     - `requiredPermission="x"` / `withPermission(X, 'x')`  -> gate POR ROTA (ProtectedRoute);
 *     - `hasPermission|hasAnyPermission|hasAllPermissions|checkPermission|
 *        checkPermissionServer|usePermission(... 'x' ...)`   -> gate do usePermissions/RoleService;
 *     - `_permission_name: 'x'`                             -> argumento da RPC user_has_permission;
 *     - metadata de MENU `permission:` dentro de `services/` -> o gate das entradas da
 *       navegacao. So `services/`: `permission:` de outras familias (ex.: o
 *       NotificationPermission de usePushNotifications, `permission: 'default'`) NAO e
 *       permissao nomeada e entraria como falso positivo na tabela.
 *     Um `permission:` com literal em qualquer OUTRO lugar do front e listado como
 *     "nao contabilizada" no fim da saida — nada fica em silencio.
 *   BANCO (padrao `supabase/migrations`, so .sql): toda chamada `user_has_permission(...)`
 *     que nao seja linha de comentario; a permissao e o ULTIMO literal da linha.
 *
 * O que este script NAO faz: nao prova que a policy cobre a acao inteira. Ele cruza
 * NOME de permissao. Permissao que a tela usa e que nenhuma migration conhece sai como
 * SEM TRAVA — que e exatamente o achado do cartao.
 *
 * Uso:
 *   node scripts/db-audit/check-screen-permission-db-guards.mjs [front] [migrations] [--exigir-trava]
 *
 * Codigos de saida: 0 = tabela gerada (relatorio); 1 = ha permissao da tela sem trava
 * E `--exigir-trava` foi pedido; 2 = entrada invalida.
 */
import fs from 'node:fs';
import path from 'node:path';

import { resolverCaminhoPermitido } from '../lib/seguranca-processo.mjs';

const args = process.argv.slice(2);
const exigirTrava = args.includes('--exigir-trava');
const posicionais = args.filter((a) => !a.startsWith('--'));
const frontPedido = posicionais[0] || 'src';
const migrationsPedido = posicionais[1] || 'supabase/migrations';

function entrar(rotulo, valor) {
  try {
    const resolvido = resolverCaminhoPermitido(valor, rotulo);
    if (!fs.existsSync(resolvido) || !fs.statSync(resolvido).isDirectory()) {
      throw new Error('diretorio inexistente: ' + valor);
    }
    return resolvido;
  } catch (erro) {
    console.error('ERRO: ' + erro.message);
    return null;
  }
}

const frontRaiz = entrar('front (gate da tela)', frontPedido);
const migrationsRaiz = entrar('migrations (trava no banco)', migrationsPedido);
if (!frontRaiz || !migrationsRaiz) {
  console.error('uso: node check-screen-permission-db-guards.mjs [front] [migrations] [--exigir-trava]');
  process.exit(2);
}

/** Caminhos de todos os arquivos sob `dir` que terminam com uma das extensoes, em ordem estavel. */
function listarArquivos(dir, extensoes) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    const entradas = fs.readdirSync(atual, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entrada of entradas) {
      const completo = path.join(atual, entrada.name);
      if (entrada.isDirectory()) pilha.push(completo);
      else if (extensoes.some((ext) => completo.endsWith(ext))) saida.push(completo);
    }
  }
  return saida.sort();
}

/** Um arquivo de tela de verdade: fora de __tests__/, sem .test./.spec. e sem .d.ts. */
function ehFonteDeTela(completo) {
  const normalizado = completo.split(path.sep).join('/');
  if (normalizado.includes('/__tests__/')) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(normalizado)) return false;
  return !normalizado.endsWith('.d.ts');
}

const P_REQUIRED = /requiredPermission\s*=\s*\{?\s*['"]([A-Za-z0-9_.:-]+)['"]/;
const P_WITH = /withPermission\s*\([^,]*,\s*['"]([A-Za-z0-9_.:-]+)['"]/;
const P_CHAMADA = /\b(?:hasPermission|hasAnyPermission|hasAllPermissions|checkPermission|checkPermissionServer|usePermission)\s*\(/;
const P_RPC_ARG = /_permission_name\s*:\s*['"]([A-Za-z0-9_.:-]+)['"]/;
const P_MENU = /permission\s*:\s*(?:['"]([A-Za-z0-9_.:-]+)['"]|([A-Z][A-Z0-9_]*))/;
const P_MENU_LITERAL = /permission\s*:\s*['"]([A-Za-z0-9_.:-]+)['"]/;
const P_CONST = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g;
const P_LITERAIS = /['"]([A-Za-z0-9_.:-]+)['"]/g;

/** Ultimo literal de permissao de uma linha (o nome e o ultimo argumento da chamada). */
function ultimoLiteral(linha) {
  const achados = [...linha.matchAll(new RegExp(P_LITERAIS.source, 'g'))].map((m) => m[1]);
  return achados.length > 0 ? achados[achados.length - 1] : null;
}

const P_DB_CHAMADA = /user_has_permission\s*\(/;

// ---------------------------------------------------------------- front (a tela)
const usadas = new Map(); // permissao -> [{ arquivo, linha }]
const ignoradas = []; // permission: com literal fora de services/ (nao entram na tabela)

function registrar(permissao, arquivo, linha) {
  if (!usadas.has(permissao)) usadas.set(permissao, []);
  usadas.get(permissao).push({ arquivo, linha });
}

const arquivosDeTela = listarArquivos(frontRaiz, ['.ts', '.tsx']).filter(ehFonteDeTela);
for (const completo of arquivosDeTela) {
  const relativo = path.relative(frontRaiz, completo).split(path.sep).join('/');
  const emServices = completo.split(path.sep).join('/').includes('/services/');
  const consts = new Map();
  const texto = fs.readFileSync(completo, 'utf8');
  for (const m of texto.matchAll(P_CONST)) consts.set(m[1], m[2]);
  const linhas = texto.split('\n');
  for (const [indice, linha] of linhas.entries()) {
    const numero = indice + 1;
    const achados = [];
    for (const regex of [P_REQUIRED, P_WITH, P_RPC_ARG]) {
      const m = regex.exec(linha);
      if (m) achados.push(m[1]);
    }
    if (P_CHAMADA.test(linha)) {
      for (const m of linha.matchAll(new RegExp(P_LITERAIS.source, 'g'))) achados.push(m[1]);
    }
    const menu = P_MENU.exec(linha);
    if (menu) {
      const nome = menu[1] ?? consts.get(menu[2]);
      if (nome) {
        if (emServices) achados.push(nome);
        else ignoradas.push({ permissao: nome, arquivo: relativo, linha: numero });
      }
    }
    for (const permissao of new Set(achados)) registrar(permissao, relativo, numero);
  }
}
// `permission: 'x'` fora de services/ que P_MENU nao pegou (literal com minuscula) tambem avisa.
for (const completo of arquivosDeTela) {
  if (completo.split(path.sep).join('/').includes('/services/')) continue;
  const relativo = path.relative(frontRaiz, completo).split(path.sep).join('/');
  const linhas = fs.readFileSync(completo, 'utf8').split('\n');
  for (const [indice, linha] of linhas.entries()) {
    const m = P_MENU_LITERAL.exec(linha);
    if (!m) continue;
    const jaVista = ignoradas.some((i) => i.arquivo === relativo && i.linha === indice + 1);
    if (!jaVista) ignoradas.push({ permissao: m[1], arquivo: relativo, linha: indice + 1 });
  }
}

// ---------------------------------------------------------------- banco (a trava)
const travadas = new Map(); // permissao -> [{ arquivo, linha }]
const arquivosSql = listarArquivos(migrationsRaiz, ['.sql']);
for (const completo of arquivosSql) {
  const relativo = path.relative(migrationsRaiz, completo).split(path.sep).join('/');
  const linhas = fs.readFileSync(completo, 'utf8').split('\n');
  for (const [indice, linha] of linhas.entries()) {
    if (linha.trimStart().startsWith('--')) continue; // comentario nao e execucao
    if (!P_DB_CHAMADA.test(linha)) continue;
    const permissao = ultimoLiteral(linha);
    if (!permissao) continue; // `user_has_permission(uuid, text)` da definicao: sem nome a ler
    if (!travadas.has(permissao)) travadas.set(permissao, []);
    travadas.get(permissao).push({ arquivo: relativo, linha: indice + 1 });
  }
}

// ---------------------------------------------------------------- tabela
const referencias = (lista) => lista.map((o) => o.arquivo + ':' + o.linha).join(', ');
const ordenadas = [...usadas.keys()].sort();

console.log('Front (gate da tela): ' + frontPedido + ' (' + arquivosDeTela.length + ' arquivo[s])');
console.log('Migrations (trava no banco): ' + migrationsPedido + ' (' + arquivosSql.length + ' arquivo[s])');
console.log('');
console.log('| permissao | usada pela tela (arquivo:linha) | trava no banco (migration:linha) | estado |');
console.log('| --- | --- | --- | --- |');
for (const permissao of ordenadas) {
  const trava = travadas.get(permissao);
  console.log(
    '| ' + permissao
    + ' | ' + referencias(usadas.get(permissao))
    + ' | ' + (trava ? referencias(trava) : '—')
    + ' | ' + (trava ? 'TRAVADA' : 'SEM TRAVA')
    + ' |',
  );
}

const semTrava = ordenadas.filter((permissao) => !travadas.has(permissao));
const travadasSemUso = [...travadas.keys()].filter((permissao) => !usadas.has(permissao)).sort();

console.log('');
console.log('Resumo: ' + ordenadas.length + ' permissao[oes] usada[s] pela tela; '
  + (ordenadas.length - semTrava.length) + ' travada[s] no banco; '
  + semTrava.length + ' SEM TRAVA' + (semTrava.length > 0 ? ' (' + semTrava.join(', ') + ')' : ''));
if (travadasSemUso.length > 0) {
  console.log('Com trava no banco e sem uso na tela: '
    + travadasSemUso.map((p) => p + ' (' + referencias(travadas.get(p)) + ')').join('; '));
}
if (ignoradas.length > 0) {
  console.log('Nao contabilizado (permission: fora de services/, nao e permissao nomeada): '
    + ignoradas.map((i) => i.permissao + ' (' + i.arquivo + ':' + i.linha + ')').join('; '));
}

if (exigirTrava && semTrava.length > 0) {
  console.error('FALHA: ' + semTrava.length + ' permissao[oes] da tela sem trava no banco: ' + semTrava.join(', '));
  process.exit(1);
}
process.exit(0);
