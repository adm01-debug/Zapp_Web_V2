#!/usr/bin/env node
// N-024: guarda contra leitura de VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
// em src/. O ambiente de hospedagem injeta essas variaveis apontando para outro
// projeto (o proprio src/integrations/supabase/client.ts documenta isso). A URL
// canonica vem de src/config/supabase.ts (SUPABASE_URL).
//
// Excecoes (não varridas):
//   - arquivos de teste (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx, __tests__/)
//   - src/config/supabase.ts (configuracao, nao aplicação)
//
// Uso: node scripts/ci/check-supabase-url-import-meta.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SRC = join(RAIZ, '..', '..', 'src');

const PADRAO_URL = /import\.meta\.env\.VITE_SUPABASE_URL\b/u;
const PADRAO_KEY = /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY\b/u;

/** Retorna true se o caminho é um arquivo de teste. */
function ehTeste(caminho) {
  return /\.test\.(ts|tsx|js|jsx)$/u.test(caminho) || /\.spec\.(ts|tsx|js|jsx)$/u.test(caminho);
}

/** Retorna true se o caminho deve ser ignorado pela guarda. */
function ignorar(caminho) {
  if (ehTeste(caminho)) return true;
  // src/config/supabase.ts é arquivo de configuração — a URL canônica vem de SUPABASE_URL, não de VITE_*.
  if (caminho.endsWith('src/config/supabase.ts')) return true;
  return false;
}

/** Varre src/ recursivamente e devolve violações. */
export function varrer(dir = SRC) {
  const violacoes = [];

  function percorrer(diretorio) {
    let entradas;
    try {
      entradas = readdirSync(diretorio);
    } catch {
      return;
    }
    for (const nome of entradas.sort()) {
      const caminho = join(diretorio, nome);
      let stat;
      try {
        stat = statSync(caminho);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        percorrer(caminho);
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/u.test(nome)) {
        if (ignorar(caminho)) continue;
        const conteudo = readFileSync(caminho, 'utf8');
        const linhas = conteudo.split(/\r?\n/u);
        for (let i = 0; i < linhas.length; i += 1) {
          const linha = linhas[i];
          if (PADRAO_URL.test(linha)) {
            violacoes.push({
              arquivo: relative(process.cwd(), caminho),
              linha: i + 1,
              variavel: 'VITE_SUPABASE_URL',
              texto: linha.trim(),
            });
          }
          if (PADRAO_KEY.test(linha)) {
            violacoes.push({
              arquivo: relative(process.cwd(), caminho),
              linha: i + 1,
              variavel: 'VITE_SUPABASE_PUBLISHABLE_KEY',
              texto: linha.trim(),
            });
          }
        }
      }
    }
  }

  percorrer(dir);
  return violacoes;
}

export function avaliar(violacoes) {
  if (violacoes.length === 0) return [];
  return violacoes.map(
    (v) =>
      `${v.arquivo}:${v.linha} — lê import.meta.env.${v.variavel} (src/ não deve ler VITE_SUPABASE_URL/PUBLISHABLE_KEY; use a URL canônica de @/config/supabase)`,
  );
}

export function guarda(dir = SRC) {
  return avaliar(varrer(dir));
}

const executadoDireto =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (executadoDireto) {
  const violacoes = guarda();
  if (violacoes.length > 0) {
    console.error('VIOLACAO: src/ lê VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY via import.meta.env\n');
    for (const v of violacoes) console.error(` - ${v}`);
    console.error(
      `\n${violacoes.length} violacao(oes). A URL e a chave do Supabase vêm de @/config/supabase (SUPABASE_URL), não de import.meta.env.VITE_*.`,
    );
    process.exit(1);
  }
  console.log('OK: nenhum arquivo de src/ lê VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY via import.meta.env.');
}
