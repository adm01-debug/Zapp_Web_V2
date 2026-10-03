#!/usr/bin/env node
// E74: o `deploy-output.log` vai para o artifact do GitHub. A saida do CLI carrega
// URL com `access_token=` embutido -- publicar isso e' publicar credencial num
// storage de terceiro. Este modulo reescreve o arquivo removendo o valor do segredo
// e a propria chave antes do upload.
//
// O valor NUNCA entra no codigo nem na saida: vem do ambiente pelo nome da variavel
// (--segredo-env=SUPABASE_ACCESS_TOKEN). O que este modulo imprime e' so' a contagem.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CHAVE_ALVO = /access[_%-]?token/gi;

export function redigir(texto, segredos = []) {
  let saida = texto;
  // 1. o valor literal, quando conhecido: e' a remocao que de fato protege.
  for (const valor of segredos) {
    const v = String(valor ?? '').trim();
    if (v.length < 8) continue; // valor curto demais nao e' token; evita trocar texto comum
    saida = saida.split(v).join('***');
  }
  // 2. a chave, com o que sobrou de valor a' direita (`access_token=abc`, `&access_token: x`).
  saida = saida.replace(new RegExp(`${CHAVE_ALVO.source}([=:])([^\\s"'&\\\\]*)`, 'gi'), 'token$1***');
  // 3. o nome da chave sem valor (ex.: "campo access_token ausente").
  saida = saida.replace(CHAVE_ALVO, (m) => (m === 'token' ? m : 'token'));
  return saida;
}

function principal(argv) {
  const arquivo = argv[2];
  const nomes = argv.slice(3).filter((a) => a.startsWith('--segredo-env=')).map((a) => a.split('=')[1]);
  if (!arquivo || !existsSync(arquivo)) {
    console.error(`::error::log de deploy nao encontrado: ${arquivo ?? '(vazio)'}`);
    process.exit(2);
  }
  const original = readFileSync(arquivo, 'utf8');
  const segredos = nomes.map((n) => process.env[n]).filter(Boolean);
  const limpo = redigir(original, segredos);
  const removidos = (original.match(CHAVE_ALVO) || []).length;
  writeFileSync(arquivo, limpo);
  console.log(`log redigido: ${removidos} ocorrencia(s) de chave de token, ${segredos.length} valor(es) literal(is) removido(s)`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal(process.argv);
