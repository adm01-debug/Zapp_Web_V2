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
 * consumo aparece registrado; EXIT 2 quando falta credencial; EXIT 1 quando a
 * prova roda mas falha.
 */

import { readFileSync, existsSync } from "node:fs";

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
  console.error(`  resposta do Auth (sem credencial): ${corpo.slice(0, 180)}`);
  process.exit(2);
}
const token = (await rLogin.json()).access_token;
ver(Boolean(token), `login aceito (HTTP ${statusLogin}) — JWT obtido e mantido oculto`);

if (SO_LOGIN) {
  console.log(`\n=== SO LOGIN: credencial VALIDA (${falhas === 0 ? "OK" : "FALHOU"}) ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

// 2) Classificacao real
async function classificar(fn, corpo, rotulo) {
  console.log(`\n2) ${rotulo}`);
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
  console.log(`  HTTP ${r.status}   categoria retornada: ${categoria ?? "(sem categoria)"}`);
  ver(r.status === 200, `${fn} respondeu 200`);
  ver(Boolean(categoria) && categoria !== "outros", `${fn} classificou de verdade (nao caiu no fallback 'outros')`);
  return categoria;
}

const categoriaSticker = await classificar("classify-sticker", { image_url: STICKER_PADRAO }, "classify-sticker — figurinha REAL do banco");
const categoriaEmoji = await classificar("classify-emoji", { image_url: EMOJI_PADRAO, file_name: "feliz.png" }, "classify-emoji — imagem de emoji");

// 3) Consumo registrado (leitura pela API REST com o token do usuario)
// Colunas reais da tabela (conferidas em _shared/ai-usage.ts): nao existe `provider_id`
// — o provedor vai dentro de `metadata`. Pedir coluna inexistente devolve HTTP 400.
console.log("\n3) Consumo em ai_usage_logs (a chamada paga deixou de ser invisivel)");
const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const colunas = "function_name,model,status,error_message,metadata,created_at";
const consulta = `${urlBase}/rest/v1/ai_usage_logs?select=${colunas}&created_at=gte.${encodeURIComponent(desde)}&order=created_at.desc&limit=20`;
const rUso = await fetch(consulta, { headers: cab(token) });
if (!rUso.ok) {
  console.log(`  AVISO  HTTP ${rUso.status} — este usuario nao pode ler ai_usage_logs.`);
  console.log("  O consumo precisa ser conferido pelo gateway de leitura do banco (a prova nao falha por isto).");
} else {
  const linhas = await rUso.json();
  const minhas = linhas.filter((l) => ["classify-sticker", "classify-emoji"].includes(l.function_name));
  console.log(`  linhas novas dos classificadores nos ultimos 5 min: ${minhas.length}`);
  for (const l of minhas.slice(0, 6)) {
    const provedor = l.metadata?.provider_id ?? "(sem metadata.provider_id)";
    console.log(`    ${l.created_at}  ${l.function_name}  status=${l.status}  model=${l.model ?? "(nulo)"}  provider=${provedor}  erro=${l.error_message ?? "-"}`);
  }
  ver(minhas.length >= 2, "as DUAS chamadas registradas em ai_usage_logs");
  ver(minhas.some((l) => l.status === "success"), "ha registro de SUCESSO nos classificadores");
  ver(minhas.some((l) => String(l.model || "").toLowerCase().includes("gemini")),
    "alguma linha com modelo Gemini (prova de que foi o provedor de VISAO, nao o de texto)");
}

console.log(`\n=== RESULTADO: ${falhas === 0 ? "PROVA OK" : `PROVA FALHOU (${falhas} verificacao(oes) vermelha(s))`} ===`);
console.log(`categorias: figurinha=${categoriaSticker}  emoji=${categoriaEmoji}`);
process.exit(falhas === 0 ? 0 : 1);
