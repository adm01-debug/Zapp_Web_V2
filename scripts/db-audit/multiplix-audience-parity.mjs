#!/usr/bin/env node
/**
 * multiplix-audience-parity.mjs — F23 (prova de contagem da ponte Singu).
 *
 * Para cada filtro (papel x3, ramo, UF, texto) e para combinados, compara:
 *
 *   (A) public.multiplix_count_audience — chamada pelo PostgREST do projeto
 *       EXTERNO (Singu), exatamente como a edge supabase/functions/
 *       multiplix-audience chama (POST /rest/v1/rpc/... com apikey +
 *       Authorization: Bearer service_role). E o caminho de PRODUCAO.
 *
 *   (B) a consulta SQL direta equivalente — count(*) com o MESMO WHERE do
 *       corpo da RPC, rodada no MESMO banco pela Management API do Supabase
 *       (POST /v1/projects/<ref>/database/query). E o caminho INDEPENDENTE,
 *       sem passar pela funcao.
 *
 * Igualdade exigida: (A) === (B) em todos os casos. Se qualquer par divergir,
 * sai != 0 imprimindo a tabela.
 *
 * POR QUE A MANAGEMENT API NA CONSULTA DIRETA (e nao o PostgREST):
 *   O PostgREST do Singu expoe tabelas e RPCs, mas a contagem da RPC nao e um
 *   simples count() de tabela — e um count(*) sobre um LEFT JOIN
 *   companies x company_addresses (is_primary) com filtro de texto
 *   (plainto_tsquery em search_vector) e clausulas OR (papel/ramo). Reproduzir
 *   isso "pelo PostgREST" exigiria baixar dezenas de milhares de linhas de
 *   companies e company_addresses e refazer o JOIN e a busca textual em JS —
 *   um caminho DIFERENTE e mais fraco (nao exercita o mesmo SQL). A Management
 *   API roda o SQL literal no mesmo Postgres, que e a unica comparacao honesta.
 *
 * O WHERE direto (B) e transcricao LITERAL do corpo versionado em
 *   supabase/migrations/_foreign/singu/multiplix_count_audience.sql
 * (fonte da verdade, md5 conferido com o banco), com os parametros inlinados
 * como literais SQL e o escopo fixado em admin ('admin' = ANY(ARRAY['admin'])),
 * de forma que o ramo de escopo da RPC e sempre verdadeiro — o objetivo aqui e
 * provar os FILTROS, nao o escopo (F24 cobre escopo).
 *
 * CREDENCIAIS (nenhuma e impressa):
 *   EXTERNAL_SUPABASE_URL              (PostgREST / RPC)
 *   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY (PostgREST / RPC)
 *   SUPABASE_ACCESS_TOKEN ou ~/.supabase/access-token (Management API / SQL)
 * Faltando qualquer uma, PULA e sai 0 — o CI offline (db-guard.yml) nao tem
 * essas credenciais e nao pode quebrar por isso.
 *
 * Uso:
 *   set -a; . .tmp/singu.env; set +a
 *   node scripts/db-audit/multiplix-audience-parity.mjs
 *
 * Exit codes: 0 = todos os pares iguais (ou PULADO); 1 = alguma divergencia;
 *             2 = erro de configuracao/HTTP (URL de projeto errado, etc.).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ref documentada da ponte (CLAUDE.md:23, ADR-007). A URL externa TEM de
// apontar para ela; se apontar para outro projeto, a prova nao vale — falha
// alto em vez de comparar o banco errado.
const EXPECTED_SINGU_REF = 'pgxfvjmuubtbowutlide';

const RPC_NAME = 'multiplix_count_audience';
const SCOPE_ADMIN = ['admin']; // 'admin' = ANY(p_scope_permissions) => escopo sempre verdadeiro

/** Aspas de literal SQL (string simples, com escape de apóstrofo). */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Array SQL de text[] a partir de uma lista JS (ou NULL::text[]). */
function sqlTextArray(values) {
  if (values === null || values === undefined) return 'NULL::text[]';
  return `ARRAY[${values.map((v) => sqlString(v)).join(', ')}]::text[]`;
}

/**
 * Transcreve o corpo da RPC (versao versionada em _foreign/singu) com os
 * parametros inlinados. Espelha cada clausula do SQL da funcao.
 */
function buildDirectSql(filters) {
  const roles = sqlTextArray(filters.p_roles ?? null);
  const ramo = filters.p_ramo === undefined || filters.p_ramo === null
    ? 'NULL::text' : sqlString(filters.p_ramo);
  const search = filters.p_search === undefined || filters.p_search === null
    ? 'NULL::text' : sqlString(filters.p_search);
  const uf = filters.p_uf === undefined || filters.p_uf === null
    ? 'NULL::text' : sqlString(filters.p_uf);

  return [
    'SELECT count(*)::bigint AS n',
    'FROM public.companies c',
    'LEFT JOIN public.company_addresses ca',
    '  ON ca.company_id = c.id AND ca.is_primary = true',
    "WHERE c.deleted_at IS NULL AND c.status = 'ativo'",
    `  AND 'admin' = ANY(${sqlTextArray(SCOPE_ADMIN)})`,
    `  AND (${roles} IS NULL OR cardinality(${roles}) = 0`,
    `    OR ('cliente' = ANY(${roles}) AND c.is_customer)`,
    `    OR ('fornecedor' = ANY(${roles}) AND c.is_supplier)`,
    `    OR ('transportadora' = ANY(${roles}) AND c.is_carrier))`,
    `  AND (${ramo} IS NULL`,
    `    OR c.ramo_atividade = ${ramo}`,
    `    OR (${ramo} = 'Não informado' AND (c.ramo_atividade IS NULL OR trim(c.ramo_atividade) = '')))`,
    `  AND (${search} IS NULL OR trim(${search}) = '' OR c.search_vector @@ plainto_tsquery('portuguese', ${search}))`,
    `  AND (${uf} IS NULL OR ca.estado = ${uf})`,
  ].join('\n');
}

/** Casos: >= 8, cobrindo cada filtro isolado e combinados com valor NAO-zero. */
function casos() {
  return [
    { nome: 'sem_filtro', filtros: {} },
    { nome: 'papel=cliente', filtros: { p_roles: ['cliente'] } },
    { nome: 'papel=fornecedor', filtros: { p_roles: ['fornecedor'] } },
    { nome: 'papel=transportadora', filtros: { p_roles: ['transportadora'] } },
    { nome: 'ramo=Cooperativas de Crédito', filtros: { p_ramo: 'Cooperativas de Crédito' } },
    { nome: 'uf=SP', filtros: { p_uf: 'SP' } },
    { nome: 'texto=credito', filtros: { p_search: 'credito' } },
    // Combinados (o combinado do plano deu 0 — igualdade degenerada; estes
    // exercitam OR de papel + JOIN de endereco + tsquery de verdade):
    { nome: 'cliente + uf=SP', filtros: { p_roles: ['cliente'], p_uf: 'SP' } },
    { nome: 'ramo=Coop.Crédito + uf=MG', filtros: { p_ramo: 'Cooperativas de Crédito', p_uf: 'MG' } },
    { nome: 'texto=credito + uf=SP', filtros: { p_search: 'credito', p_uf: 'SP' } },
    { nome: 'ramo=Não informado', filtros: { p_ramo: 'Não informado' } },
  ];
}

function refDaUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return null;
  }
}

function lerToken() {
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env) return env;
  try {
    return fs
      .readFileSync(path.join(os.homedir(), '.supabase', 'access-token'), 'utf8')
      .trim();
  } catch {
    return null;
  }
}

function pular(motivo) {
  console.log(`PULADO: ${motivo}. Fixe as credenciais e rode de novo (nada a provar aqui).`);
  process.exit(0);
}

/**
 * F22 — contrato v1 da assinatura de escopo, identico ao da edge
 * (supabase/functions/multiplix-audience/index.ts) e ao do guard versionado em
 * supabase/migrations/_foreign/singu/20261001160000_singu_guard_hmac_escopo.sql:
 *   payload = `v1|<permissoes ordenadas asc, unidas por ",">|<email ou "">|<exp>`
 *   assinatura = HMAC-SHA256 hex com MULTIPLIX_SCOPE_HMAC_SECRET
 */
function assinarEscopo(permissions, vendedorEmail, secret, agoraMs = Date.now()) {
  const exp = Math.floor(agoraMs / 1000) + 300;
  // S2871: comparador explicito. Para os identificadores de permissao em uso
  // (ascii minusculo: admin/suppliers/carriers/customers_own/customers_all) a
  // ordem e identica ao sort() padrao e ao COLLATE "C" do guard SQL — o payload
  // v1 continua o mesmo.
  const payload = `v1|${[...permissions].sort((a, b) => a.localeCompare(b)).join(',')}|${vendedorEmail ?? ''}|${exp}`;
  return { hmac: crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex'), exp };
}

/**
 * Cabecalhos de assinatura do escopo. Com o segredo no ambiente, o script
 * assina como a edge assina em producao (cabecalho, nao parametro — parametro
 * novo muda a assinatura da funcao e o PostgREST devolve 404). Sem o segredo,
 * manda sem assinatura e avisa: isso passa enquanto o guard do F22 nao foi
 * aplicado no Singu e vira 42501 depois que ele entrar — o aviso existe para
 * ninguem confundir essa falha com bug do script.
 */
function headersDeAssinatura() {
  const secret = process.env.MULTIPLIX_SCOPE_HMAC_SECRET;
  if (!secret) {
    console.warn(
      'AVISO: MULTIPLIX_SCOPE_HMAC_SECRET ausente — chamando o Singu SEM assinatura de escopo. ' +
        'Passa enquanto o guard (F22) nao estiver aplicado; depois dele isto vira 42501.',
    );
    return {};
  }
  const { hmac, exp } = assinarEscopo(SCOPE_ADMIN, null, secret);
  return { 'x-multiplix-scope-hmac': hmac, 'x-multiplix-scope-exp': String(exp) };
}

async function chamarRpc(supabaseUrl, serviceKey, filters) {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${RPC_NAME}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...headersDeAssinatura(),
    },
    body: JSON.stringify({ ...filters, p_scope_permissions: SCOPE_ADMIN }),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`PostgREST HTTP ${res.status}: ${texto.slice(0, 300)}`);
  const valor = Number(texto);
  if (!Number.isFinite(valor)) throw new Error(`RPC nao devolveu numero: ${texto.slice(0, 120)}`);
  return valor;
}

async function rodarSqlDireto(ref, token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${texto.slice(0, 300)}`);
  const linhas = JSON.parse(texto);
  const valor = Number(Array.isArray(linhas) ? linhas[0]?.n : Number.NaN);
  if (!Number.isFinite(valor)) throw new Error(`SQL direto nao devolveu 'n' numerico`);
  return valor;
}

// O caso 'sem_filtro' e um count(*) de 57k linhas com LEFT JOIN: no PostgREST do
// Singu ele ja estourou statement_timeout (57014) de forma intermitente sob carga.
// Isso e hipicone de infraestrutura, nao divergencia — re-tenta so o que e
// transitorio (5xx/timeout/rede). Erro logico (4xx) nao re-tenta.
function transitorio(mensagem) {
  return /57014|statement timeout|HTTP 5\d\d|fetch failed|aborted|timed out/i.test(mensagem);
}

async function comRetentativa(fn, rotulo, tentativas = 4, atrasoMs = 1500) {
  let ultimo;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      return await fn();
    } catch (erro) {
      ultimo = erro;
      if (i === tentativas || !transitorio(erro.message)) break;
      await new Promise((resolve) => setTimeout(resolve, atrasoMs * i));
    }
  }
  throw new Error(`${rotulo}: ${ultimo.message}`);
}

async function main() {
  const supabaseUrl = process.env.EXTERNAL_SUPABASE_URL;
  const serviceKey = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  const token = lerToken();

  if (!supabaseUrl || !serviceKey || !token) {
    pular('EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY / token da Management API ausentes');
    return;
  }

  const ref = refDaUrl(supabaseUrl);
  if (ref !== EXPECTED_SINGU_REF) {
    console.error(
      `ERRO: EXTERNAL_SUPABASE_URL aponta para "${ref}", esperado "${EXPECTED_SINGU_REF}" (projeto Singu). `
      + 'A paridade so vale contra o banco da ponte — abortando.',
    );
    process.exit(2);
  }

  console.log(`# F23 multiplix-audience-parity — ref=${ref}`);
  console.log('# (A) RPC via PostgREST (caminho de producao) x (B) SQL direto no mesmo Postgres (Management API)\n');

  const resultados = [];
  for (const caso of casos()) {
    try {
      const viaRpc = await comRetentativa(() => chamarRpc(supabaseUrl, serviceKey, caso.filtros), 'RPC');
      const viaSql = await comRetentativa(() => rodarSqlDireto(ref, token, buildDirectSql(caso.filtros)), 'SQL');
      resultados.push({ caso: caso.nome, viaRpc, viaSql, igual: viaRpc === viaSql });
    } catch (erro) {
      resultados.push({ caso: caso.nome, viaRpc: null, viaSql: null, igual: false, erro: erro.message });
    }
  }

  const larguraCaso = Math.max(18, ...resultados.map((r) => r.caso.length));
  console.log(`${'caso'.padEnd(larguraCaso)}  ${'RPC(A)'.padStart(9)}  ${'SQL(B)'.padStart(9)}  igual`);
  console.log(`${'-'.repeat(larguraCaso)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  -----`);
  for (const r of resultados) {
    const a = r.viaRpc === null ? 'ERRO' : String(r.viaRpc).padStart(9);
    const b = r.viaSql === null ? 'ERRO' : String(r.viaSql).padStart(9);
    console.log(`${r.caso.padEnd(larguraCaso)}  ${a.padStart(9)}  ${b.padStart(9)}  ${r.igual ? 'sim' : 'NAO'}`
      + (r.erro ? `  <- ${r.erro}` : ''));
  }

  const divergentes = resultados.filter((r) => !r.igual);
  console.log('');
  console.log(`${resultados.length - divergentes.length}/${resultados.length} pares iguais.`);
  if (divergentes.length > 0) {
    console.error(`FALHA: ${divergentes.length} par(es) divergente(s): ${divergentes.map((r) => r.caso).join(', ')}`);
    process.exit(1);
  }
}

main().catch((erro) => {
  console.error(`ERRO inesperado: ${erro.message}`);
  process.exit(2);
});
