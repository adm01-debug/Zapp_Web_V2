#!/usr/bin/env node
/**
 * Inventario do banco oficial -> inventario/estado/banco.json (fonte de consulta dos agentes).
 *
 * Tudo sai de comando: o SQL de leitura `scripts/inventario/banco.sql` + o uso de cada
 * tabela no codigo (`.from('tabela')` em src/ e supabase/functions/). Nada escrito a mao.
 *
 * Dois jeitos de rodar:
 *   1) Com credencial viva (CI / maquina com acesso):
 *        DESTINO_URL=postgres://... node scripts/inventario/gerar-banco.mjs
 *      Identidade do banco e TLS conferidos antes de qualquer consulta (mesmo contrato de
 *      scripts/db-audit/telefonia-snapshot.mjs); banco errado = exit 2, nada gravado.
 *   2) Sessao de agente sem DESTINO_URL: rodar banco.sql no MCP oficial
 *      (SUPABASE - ZAPP WEB V2 - MCP, db_query), salvar a resposta num arquivo e
 *        node scripts/inventario/gerar-banco.mjs --entrada /caminho/resposta.json
 *      Aceita a resposta crua do MCP ({"rows":[{"inventario":{...}}]}) ou o objeto direto.
 *
 * Exit: 0 = gravado; 2 = entrada invalida, identidade/TLS inseguro ou psql falhou.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_PATH = path.join(RAIZ, 'scripts/inventario/banco.sql');
const SAIDA = path.join(RAIZ, 'inventario/estado/banco.json');
const PASTAS_CODIGO = ['src', 'supabase/functions'];
const EXTENSOES = /\.(ts|tsx|js|jsx|mjs)$/;

// Limiares dos alertas: o que um agente precisa saber antes de mexer no sistema.
export const LIMIARES = {
  taxaFalhaCronPct: 5,
  historicoCronMaisDe7Dias: 50000,
};

/** Extrai o objeto do inventario da resposta do psql ou do MCP. */
export function extrairInventario(bruto) {
  let dado = typeof bruto === 'string' ? JSON.parse(bruto.trim()) : bruto;
  if (dado && Array.isArray(dado.rows)) dado = dado.rows[0];
  if (dado && dado.inventario) dado = dado.inventario;
  if (typeof dado === 'string') dado = JSON.parse(dado);
  const faltando = ['format_version', 'medido_em', 'resumo', 'tabelas', 'cron', 'whatsapp']
    .filter((chave) => !(dado && chave in dado));
  if (faltando.length) throw new Error(`entrada sem as chaves: ${faltando.join(', ')}`);
  if (dado.format_version !== 1) throw new Error(`format_version ${dado.format_version} desconhecido (esperado 1)`);
  if (!Array.isArray(dado.tabelas) || dado.tabelas.length === 0) throw new Error('entrada sem tabelas');
  return dado;
}

function listarArquivos(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarArquivos(p, acc);
    else if (EXTENSOES.test(entrada.name)) acc.push(p);
  }
  return acc;
}

/** Quantos `.from('tabela')` existem em src/ e em supabase/functions/ (testes excluidos). */
export function contarUsoNoCodigo(raiz, nomes) {
  const uso = Object.fromEntries(nomes.map((n) => [n, { src: 0, edges: 0 }]));
  const re = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
  for (const pasta of PASTAS_CODIGO) {
    const chave = pasta === 'src' ? 'src' : 'edges';
    for (const arquivo of listarArquivos(path.join(raiz, pasta))) {
      if (/(\.test\.|\.spec\.|__tests__)/.test(arquivo)) continue;
      const texto = fs.readFileSync(arquivo, 'utf8');
      for (const m of texto.matchAll(re)) if (uso[m[1]]) uso[m[1]][chave] += 1;
    }
  }
  return uso;
}

/** Ordena chaves recursivamente: o diff entre execucoes fica so no que mudou. */
function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenar(valor[k])]));
  }
  return valor;
}

/** Junta banco + codigo e calcula orfas e alertas. Funcao pura (testada em scripts/ci/). */
export function montarInventario(dado, uso) {
  const tabelas = dado.tabelas.map((t) => ({ ...t, uso_no_codigo: uso[t.nome] ?? { src: 0, edges: 0 } }));
  const orfas = tabelas
    .filter((t) => t.linhas === 0 && !t.citada_no_banco && t.uso_no_codigo.src + t.uso_no_codigo.edges === 0)
    .map((t) => t.nome);

  const alertas = [];
  const semRls = tabelas.filter((t) => !t.rls).map((t) => t.nome);
  if (semRls.length) alertas.push({ tipo: 'tabela_sem_rls', detalhe: semRls });
  const cronRuim = dado.cron.jobs
    .filter((j) => j.ativo && j.taxa_falha_7d_pct >= LIMIARES.taxaFalhaCronPct)
    .map((j) => `${j.nome} (${j.taxa_falha_7d_pct}% em 7d)`);
  if (cronRuim.length) alertas.push({ tipo: 'cron_falhando', detalhe: cronRuim });
  if (dado.cron.horas_paradas_7d.length) {
    alertas.push({ tipo: 'cron_parado', detalhe: dado.cron.horas_paradas_7d.map((h) => h.hora) });
  }
  if (dado.cron.historico.mais_de_7_dias > LIMIARES.historicoCronMaisDe7Dias) {
    alertas.push({ tipo: 'historico_cron_sem_limpeza', detalhe: [`${dado.cron.historico.mais_de_7_dias} linhas com mais de 7 dias`] });
  }
  const padrao = dado.whatsapp.conexoes.find((c) => c.padrao);
  if (!padrao) alertas.push({ tipo: 'whatsapp_sem_conexao_padrao', detalhe: [] });
  else if (padrao.status !== 'connected') {
    alertas.push({ tipo: 'whatsapp_desconectado', detalhe: [`${padrao.instance_id}: ${padrao.status}`] });
  }

  return ordenar({
    ...dado,
    fonte: 'scripts/inventario/banco.sql + .from() em src/ e supabase/functions/ (scripts/inventario/gerar-banco.mjs)',
    tabelas,
    tabelas_orfas: {
      criterio: '0 linhas + nao citada em funcao/view do banco + nenhum .from() em src/ ou supabase/functions/',
      lista: orfas,
    },
    alertas,
  });
}

function lerDoBanco() {
  const url = process.env.DESTINO_URL?.trim();
  if (!url) throw new Error('sem --entrada e sem DESTINO_URL: nada para ler (veja o cabecalho do script).');
  // database-identity.mjs usa o caminho do certificado da CA relativo a raiz do repo.
  process.chdir(RAIZ);
  // Import tardio: o modo --entrada (agente) nao depende do transporte do psql.
  return import(pathToFileURL(path.join(RAIZ, 'scripts/db-audit/database-identity.mjs')).href)
    .then(async (identidadeMod) => {
      const { carregarIdentidadeEsperada, validarDestino, validarSupabaseCa, endurecerDestinoTls } = identidadeMod;
      const { withPsqlEnvironment } = await import(pathToFileURL(path.join(RAIZ, 'scripts/db-audit/psql-environment.mjs')).href);
      const identidade = carregarIdentidadeEsperada(path.join(RAIZ, 'scripts/db-audit/database-identity.json'));
      const problemas = validarDestino(url, identidade);
      if (problemas.length) throw new Error(problemas.join('; '));
      const tls = endurecerDestinoTls(url);
      const problemasTls = [...validarSupabaseCa(), ...tls.erros];
      if (problemasTls.length) throw new Error(problemasTls.join('; '));
      try {
        return withPsqlEnvironment(tls.connectionString, (env) => execFileSync(process.env.PSQL_BIN || 'psql',
          ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', SQL_PATH],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, env }));
      } catch (error) {
        // stderr do libpq pode repetir credencial: nao repassa.
        const status = Number.isInteger(error?.status) ? error.status : '?';
        throw new Error(`psql falhou (exit ${status}); diagnostico suprimido.`);
      }
    });
}

async function main(argv) {
  const i = argv.indexOf('--entrada');
  let bruto;
  if (i !== -1) {
    const arquivo = argv[i + 1];
    if (!arquivo) throw new Error('--entrada exige o caminho do arquivo com a resposta do banco.sql');
    bruto = fs.readFileSync(arquivo, 'utf8');
  } else {
    bruto = await lerDoBanco();
  }
  const dado = extrairInventario(bruto);
  const uso = contarUsoNoCodigo(RAIZ, dado.tabelas.map((t) => t.nome));
  const inventario = montarInventario(dado, uso);
  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, JSON.stringify(inventario, null, 2) + '\n');
  console.log(`banco.json: ${inventario.tabelas.length} tabelas, ${inventario.cron.jobs.length} cron jobs, `
    + `${inventario.tabelas_orfas.lista.length} orfas, ${inventario.alertas.length} alertas (medido_em ${inventario.medido_em}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`ERRO: ${error.message}`);
    process.exit(2);
  });
}
