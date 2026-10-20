#!/usr/bin/env node
// N-024: guarda contra leitura de VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
// em src/. O ambiente de hospedagem injeta essas variaveis apontando para outro
// projeto (o proprio src/integrations/supabase/client.ts documenta isso). A URL
// canonica vem de src/config/supabase.ts (SUPABASE_URL).
//
// Cobre as tres formas usadas na base: acesso por ponto
// (import.meta.env.VITE_SUPABASE_URL), por colchete
// (import.meta.env['VITE_SUPABASE_URL']) e por destructuring
// (const { VITE_SUPABASE_URL } = import.meta.env), inclusive quando o
// destructuring ocupa varias linhas.
//
// Excecoes (nao varridas):
//   - arquivos de teste por nome (*.test.(ts|tsx|js|jsx), *.spec.(ts|tsx|js|jsx))
//   - qualquer arquivo dentro de um diretorio __tests__/
//   - src/config/supabase.ts (configuracao, nao aplicacao)
//
// Limitação conhecida (fora do escopo): alias do objeto
// (const env = import.meta.env; env.VITE_SUPABASE_URL) nao e detectado.
//
// Uso: node scripts/ci/check-supabase-url-import-meta.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SRC = join(RAIZ, '..', '..', 'src');

const VARIAVEIS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
const LE_ENV = /import\.meta\.env/u;
const PADROES = VARIAVEIS.map((variavel) => ({
  variavel,
  re: new RegExp(`\\b${variavel}\\b`, 'u'),
}));

/** Devolve os nomes das variaveis sensiveis lidas na linha via import.meta.env. */
function variaveisNaLinha(linha) {
  if (!LE_ENV.test(linha)) return [];
  return PADROES.filter((p) => p.re.test(linha)).map((p) => p.variavel);
}

/** Detecta destructuring multilinha ({ VAR } = import.meta.env) no conteudo inteiro. */
function destructuringMultilinha(conteudo) {
  const achados = [];
  const linhas = conteudo.split(/\r?\n/u);
  for (const variavel of VARIAVEIS) {
    const re = new RegExp(`\\{[^}]*\\b${variavel}\\b[^}]*\\}\\s*=\\s*import\\.meta\\.env`, 'gsu');
    let m;
    while ((m = re.exec(conteudo)) !== null) {
      const posVar = m.index + m[0].indexOf(variavel);
      const linha = conteudo.slice(0, posVar).split(/\r?\n/u).length;
      achados.push({ variavel, linha, texto: (linhas[linha - 1] || '').trim() });
      // Evita loop infinito em match vazio (nao esperado aqui, mas barato).
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return achados;
}

/** Retorna true se o caminho é um arquivo de teste pelo nome. */
function ehTeste(caminho) {
  return /\.test\.(ts|tsx|js|jsx)$/u.test(caminho) || /\.spec\.(ts|tsx|js|jsx)$/u.test(caminho);
}

/** Normaliza o caminho para comparacao com separador '/'. */
function normalizar(caminho) {
  return caminho.split('\\').join('/');
}

/** Retorna true se o caminho deve ser ignorado pela guarda. */
function ignorar(caminho, dir = SRC) {
  if (ehTeste(caminho)) return true;
  const posix = normalizar(caminho);
  // Qualquer arquivo dentro de um diretorio __tests__/ e ignorado.
  if (/(^|\/)__tests__\//u.test(posix)) return true;
  // Comparacao exata do relativo a raiz varrida: so config/supabase.ts.
  // (endsWith('src/config/supabase.ts') tambem casaria src/x/src/config/supabase.ts.)
  const rel = normalizar(relative(dir, caminho));
  if (rel === 'config/supabase.ts') return true;
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
      if (nome === '__tests__') continue;
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
        if (ignorar(caminho, dir)) continue;
        const conteudo = readFileSync(caminho, 'utf8');
        const vistas = new Set();
        const linhas = conteudo.split(/\r?\n/u);
        for (let i = 0; i < linhas.length; i += 1) {
          const linha = linhas[i];
          for (const variavel of variaveisNaLinha(linha)) {
            vistas.add(`${variavel}:${i + 1}`);
            violacoes.push({
              arquivo: relative(process.cwd(), caminho),
              linha: i + 1,
              variavel,
              texto: linha.trim(),
            });
          }
        }
        for (const achado of destructuringMultilinha(conteudo)) {
          const chave = `${achado.variavel}:${achado.linha}`;
          if (vistas.has(chave)) continue;
          vistas.add(chave);
          violacoes.push({
            arquivo: relative(process.cwd(), caminho),
            linha: achado.linha,
            variavel: achado.variavel,
            texto: achado.texto,
          });
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
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
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
