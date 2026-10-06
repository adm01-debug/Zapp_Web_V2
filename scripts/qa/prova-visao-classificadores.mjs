#!/usr/bin/env node
/**
 * PROVA DE VISÃO — classificadores `classify-sticker` e `classify-emoji`
 * (Bloco 04 / IA-033, PR-4)
 *
 * O QUE ISTO PROVA, de ponta a ponta, contra o ambiente PUBLICADO:
 *   1. os dois classificadores aceitam a chamada e classificam de verdade;
 *   2. o resultado NÃO é o fallback 'outros' (ou seja: a visão funcionou);
 *   3. o consumo das duas chamadas aparece em `ai_usage_logs` — o aceite do
 *      IA-032/IA-033, que é acabar com as chamadas pagas invisíveis.
 *
 * R2-INF-020 — o ponto 3 só vale por CORRELAÇÃO. Não basta "existirem duas
 * linhas": é preciso um registro NOVO e válido para CADA uma das duas chamadas
 * feitas AQUI. Por isso o provador tira uma foto dos registros existentes ANTES
 * de chamar os classificadores (linha de base) e, depois, exige um registro que
 * ainda não existia, na função certa, com status de sucesso e modelo do provedor
 * de visão (Gemini). Registro ANTERIOR, duas linhas de UMA só função, ou leitura
 * de consumo recusada (HTTP não-ok) NÃO aprovam: a leitura recusada deixa a
 * prova INCONCLUSIVA, nunca "PROVA OK".
 *
 * O QUE ELE NÃO FAZ: não usa service_role, não contorna autenticação e não
 * inventa credencial. Entra com o login de TESTE e usa o JWT do usuário,
 * exatamente como o app faz.
 *
 * REGRA DURA: este script NUNCA imprime senha, token nem chave. Ele imprime
 * apenas o e-mail da conta, os status HTTP, as categorias e as linhas de consumo.
 *
 * COMO RODAR (só precisa do arquivo de segredos com o login de teste):
 *
 *   export TMPDIR="$PWD/.tmp"
 *   node scripts/qa/prova-visao-classificadores.mjs ~/.secrets/zapp-multiplix-escopo.env
 *
 * Com `--so-login` ele apenas valida a credencial (nenhuma chamada de IA é feita):
 *
 *   node scripts/qa/prova-visao-classificadores.mjs ~/.secrets/zapp-multiplix-escopo.env --so-login
 *
 * Ordem de resolução das credenciais (a primeira que existir vence):
 *   login : ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL/PASSWORD  →  ..._LOGISTICA_...  →  ZAPP_QA_EMAIL/PASSWORD
 *   url   : ZAPP_SUPABASE_URL  →  VITE_SUPABASE_URL  →  .env.production  →  default do projeto
 *   anon  : ZAPP_ANON_KEY  →  VITE_SUPABASE_ANON_KEY  →  .env.production
 * As duas variáveis VITE_* e o `.env.production` são **versionados** no repositório
 * (configuração publicável do frontend), por isso podem ser lidos aqui.
 *
 * Saída: relatório em pt-BR. EXIT 0 só quando as duas classificações passam E o
 * consumo de CADA chamada é correlacionado; EXIT 2 quando falta credencial;
 * EXIT 1 quando a prova roda mas falha OU fica inconclusiva (ex.: sem permissão
 * de leitura do consumo).
 */

import { readFileSync, existsSync } from "node:fs";

// jssecurity:S5145 — o corpo devolvido pelo Auth, a categoria devolvida pelas
// edge functions, as linhas de consumo e o resultado final entram no log. Quebras
// de linha / caracteres de controle são neutralizados para impedir que esse
// conteúdo forje linhas de log. Valores normais (texto de uma linha, números)
// ficam iguais. Mesmo helper de scripts/ci/github-settings-guard.mjs.
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, " ");

// Figurinha REAL, existente no banco do projeto (storage público whatsapp-media).
const STICKER_PADRAO =
  "https://tnnnlkbymytvtqngbbqh.supabase.co/storage/v1/object/public/whatsapp-media/stickers/sticker_1787863317901_2A10468B4438D0B35BC6.webp";

// Imagem de emoji REAL (Twemoji/CC-BY 4.0). A tabela `custom_emojis` do projeto está
// vazia hoje, então a prova do emoji usa uma imagem de fora — DECLARADO aqui, para
// ninguém achar que veio do banco.
const EMOJI_PADRAO =
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.0.3/assets/72x72/1f60a.png";

const REF = "tnnnlkbymytvtqngbbqh";

const args = process.argv.slice(2);
const SO_LOGIN = args.includes("--so-login");
const ARQUIVO_ENV = args.find((a) => !a.startsWith("--"));

function carregarEnv(caminho) {
  const lido = {};
  if (!caminho || !existsSync(caminho)) return lido;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) lido[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return lido;
}

const env = carregarEnv(ARQUIVO_ENV);
const v = (nome) => process.env[nome] || env[nome] || "";

// --- login de teste -------------------------------------------------------
const CONTAS = [
  ["COMPRAS", "ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL", "ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD"],
  ["LOGISTICA", "ZAPP_MULTIPLIX_MULTIPLIX_LOGISTICA_EMAIL", "ZAPP_MULTIPLIX_MULTIPLIX_LOGISTICA_PASSWORD"],
  ["QA", "ZAPP_QA_EMAIL", "ZAPP_QA_PASSWORD"],
];
const conta = CONTAS.map(([rotulo, e, p]) => ({ rotulo, email: v(e), senha: v(p) })).find((c) => c.email && c.senha);

// --- url + chave anonima --------------------------------------------------
const envProducao = carregarEnv(".env.production");
const urlBase = (v("ZAPP_SUPABASE_URL") || v("VITE_SUPABASE_URL") || envProducao.VITE_SUPABASE_URL ||
  `https://${REF}.supabase.co`).replace(/\/+$/, "");
const anon = v("ZAPP_ANON_KEY") || v("ZAPP_PUBLISHABLE_KEY") || v("VITE_SUPABASE_ANON_KEY") ||
  v("VITE_SUPABASE_PUBLISHABLE_KEY") || envProducao.VITE_SUPABASE_PUBLISHABLE_KEY ||
  envProducao.VITE_SUPABASE_ANON_KEY || "";

if (!conta || !anon) {
  const faltando = [];
  if (!conta) faltando.push("login de teste (COMPRAS/LOGISTICA EMAIL+PASSWORD ou ZAPP_QA_EMAIL/PASSWORD)");
  if (!anon) faltando.push("chave anonima (ZAPP_ANON_KEY, VITE_SUPABASE_ANON_KEY ou .env.production)");
  console.error("FALTAM: " + faltando.join(" | "));
  console.error("Passe o arquivo de segredos como argumento ou exporte as variaveis.");
  process.exit(2);
}

const cab = (tok) => ({
  apikey: anon,
  ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  "Content-Type": "application/json",
});

let falhas = 0;
const ver = (ok, texto) => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK   " : "FALHA"}  ${texto}`);
};

console.log("=== PROVA DE VISAO — classificadores (IA-033 / PR-4) ===");
console.log(`conta de teste usada: ${conta.email}  [${conta.rotulo}]`);
console.log("(senha e token NAO sao impressos em nenhum momento)\n");

// 1) Login
console.log("1) Login no Supabase Auth do Zapp Web V2");
const rLogin = await fetch(`${urlBase}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: cab(null),
  body: JSON.stringify({ email: conta.email, password: conta.senha }),
});
const statusLogin = rLogin.status;
if (!rLogin.ok) {
  const corpo = await rLogin.text();
  console.error(`  FALHA  login recusado (HTTP ${statusLogin})`);
  console.error(`  resposta do Auth (sem credencial): ${semQuebra(corpo.slice(0, 180))}`);
  process.exit(2);
}
const token = (await rLogin.json()).access_token;
ver(Boolean(token), `login aceito (HTTP ${statusLogin}) — JWT obtido e mantido oculto`);

if (SO_LOGIN) {
  console.log(`\n=== SO LOGIN: credencial VALIDA (${falhas === 0 ? "OK" : "FALHOU"}) ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

// --- leitura do consumo (R2-INF-020) ---------------------------------------
// Colunas reais da tabela (conferidas em _shared/ai-usage.ts): nao existe
// `provider_id` — o provedor vai dentro de `metadata`. Pedir coluna inexistente
// devolve HTTP 400. `id` é a chave que permite identificar registros NOVOS.
const COLUNAS_CONSUMO = "id,function_name,model,status,error_message,metadata,created_at";

async function lerConsumo() {
  const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const consulta = `${urlBase}/rest/v1/ai_usage_logs?select=${COLUNAS_CONSUMO}` +
    `&created_at=gte.${encodeURIComponent(desde)}&order=created_at.desc&limit=100`;
  const r = await fetch(consulta, { headers: cab(token) });
  if (!r.ok) return { ok: false, status: r.status, linhas: [] };
  let linhas = [];
  try {
    linhas = await r.json();
  } catch {
    linhas = [];
  }
  return { ok: true, status: r.status, linhas: Array.isArray(linhas) ? linhas : [] };
}

// 2) Linha de base do consumo — foto ANTES das chamadas.
// Sem esta foto, um registro anterior (de outra execução, ou de uso normal do
// app) apareceria como se fosse desta prova. Leitura recusada NÃO vira aviso:
// sem permissão não há correlação possível, e a prova não poderá aprovar.
console.log("2) Foto do consumo ANTES das chamadas (linha de base da correlação)");
const baseConsumo = await lerConsumo();
const idsAntes = baseConsumo.ok ? new Set(baseConsumo.linhas.map((l) => l.id)) : null;
if (baseConsumo.ok) {
  console.log(`  ${idsAntes.size} registro(s) de consumo já existente(s) na janela de 5 min (não contam para a prova)`);
} else {
  console.log(`  INCONCLUSIVA  HTTP ${baseConsumo.status} — sem permissão de leitura do consumo; a prova NÃO poderá aprovar.`);
}

// 3) Classificacao real
async function classificar(fn, corpo, rotulo) {
  console.log(`\n3) ${rotulo}`);
  const r = await fetch(`${urlBase}/functions/v1/${fn}`, {
    method: "POST",
    headers: cab(token),
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  let categoria = null;
  try {
    categoria = JSON.parse(texto).category ?? null;
  } catch { /* resposta nao-JSON: a categoria fica nula e a verificacao abaixo reprova */ }
  console.log(`  HTTP ${r.status}   categoria retornada: ${semQuebra(categoria ?? "(sem categoria)")}`);
  ver(r.status === 200, `${fn} respondeu 200`);
  ver(Boolean(categoria) && categoria !== "outros", `${fn} classificou de verdade (nao caiu no fallback 'outros')`);
  return categoria;
}

const categoriaSticker = await classificar("classify-sticker", { image_url: STICKER_PADRAO }, "classify-sticker — figurinha REAL do banco");
const categoriaEmoji = await classificar("classify-emoji", { image_url: EMOJI_PADRAO, file_name: "feliz.png" }, "classify-emoji — imagem de emoji");

// 4) Consumo registrado E CORRELACIONADO (R2-INF-020)
// Só aprova o que é NOVO (não estava na foto) e válido (sucesso + provedor de
// visão) para CADA classificador. Registro anterior, duas linhas de uma função
// só, ou leitura de consumo recusada NÃO aprovam.
console.log("\n4) Consumo em ai_usage_logs (correlacionado a ESTAS duas chamadas)");
const usoDepois = await lerConsumo();
if (!baseConsumo.ok || !usoDepois.ok) {
  const status = !usoDepois.ok ? usoDepois.status : baseConsumo.status;
  console.log(`  INCONCLUSIVA  HTTP ${status} — este usuário não pode ler ai_usage_logs.`);
  console.log("  Sem a leitura do consumo não há como correlacionar as duas chamadas: a prova NÃO aprova.");
  console.log("\n=== RESULTADO: PROVA INCONCLUSIVA ===");
  console.log(`categorias: figurinha=${semQuebra(categoriaSticker)}  emoji=${semQuebra(categoriaEmoji)}`);
  process.exit(1);
}

const novas = usoDepois.linhas.filter((l) => !idsAntes.has(l.id));
console.log(`  registros de consumo NOVOS (não existiam antes das chamadas): ${novas.length}`);

// Registro VALIDO: sucesso (a chamada paga aconteceu) e modelo do provedor de
// visao (Gemini) — prova de que foi a rota de VISAO, nao a de texto.
const registroValido = (l) =>
  l.status === "success" && String(l.model || "").toLowerCase().includes("gemini");

for (const [fn, rotulo] of [["classify-sticker", "figurinha"], ["classify-emoji", "emoji"]]) {
  const minhas = novas.filter((l) => l.function_name === fn);
  for (const l of minhas.slice(0, 4)) {
    const provedor = l.metadata?.provider_id ?? "(sem metadata.provider_id)";
    console.log(
      `    ${semQuebra(l.created_at)}  ${semQuebra(l.function_name)}  status=${semQuebra(l.status)}` +
      `  model=${semQuebra(l.model ?? "(nulo)")}  provider=${semQuebra(provedor)}  erro=${semQuebra(l.error_message ?? "-")}`,
    );
  }
  ver(minhas.some(registroValido),
    `${fn} (${rotulo}): registro NOVO e válido — sucesso + modelo Gemini — correlacionado à chamada feita agora`);
}

console.log(`\n=== RESULTADO: ${falhas === 0 ? "PROVA OK" : `PROVA FALHOU (${falhas} verificacao(oes) vermelha(s))`} ===`);
console.log(`categorias: figurinha=${semQuebra(categoriaSticker)}  emoji=${semQuebra(categoriaEmoji)}`);
process.exit(falhas === 0 ? 0 : 1);
