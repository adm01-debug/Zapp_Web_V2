#!/usr/bin/env node
// Inventario gerado do lado do repositorio (sem acesso ao banco):
//  - edge functions: linhas, segredos lidos (Deno.env.get) e quem as invoca (src, migrations, outras edges, e2e, CI)
//  - tabelas: para cada nome recebido em stdin (uma por linha), quantos .from('tabela') ha em src/ e supabase/functions/
// Uso: node scripts/inventario/gerar-repo.mjs            -> escreve inventario/estado/edges.json
//      node scripts/inventario/gerar-repo.mjs < tabelas.txt -> tambem escreve inventario/estado/tabelas-uso.json
import { readdirSync, readFileSync, readSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;
const FDIR = join(RAIZ, 'supabase/functions');
const OUT = join(RAIZ, 'inventario/estado');
mkdirSync(OUT, { recursive: true });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function executarRg(args) {
  try {
    return execFileSync('rg', args, { encoding: 'utf8' });
  } catch (erro) {
    // O ripgrep usa exit 1 para "nenhum resultado"; isso não é falha da busca.
    if (erro?.status === 1) return '';
    if (erro?.code === 'ENOENT') {
      throw new Error('ripgrep (rg) não encontrado; o inventário não pode ser gerado com segurança.', { cause: erro });
    }
    const status = Number.isInteger(erro?.status) ? erro.status : 'desconhecido';
    throw new Error(`ripgrep (rg) falhou com exit ${status}; o inventário não foi gerado.`, { cause: erro });
  }
}
function rgCount(pattern, paths) {
  const out = executarRg(['-c', '--no-messages', pattern, ...paths.map((p) => join(RAIZ, p))]);
  return out.split('\n').filter(Boolean).reduce((n, l) => n + Number(l.slice(l.lastIndexOf(':') + 1)), 0);
}
function rgFiles(pattern, paths) {
  return executarRg(['-l', '--no-messages', pattern, ...paths.map((p) => join(RAIZ, p))])
    .split('\n').filter(Boolean).map((f) => f.slice(RAIZ.length));
}

function arquivosTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return arquivosTs(p);
    return d.name.endsWith('.ts') && !d.name.endsWith('.test.ts') ? [p] : [];
  });
}

const edges = readdirSync(FDIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(FDIR, d.name, 'index.ts')))
  .map((d) => d.name).sort();

const inventario = {};
for (const f of edges) {
  const q = esc(f);
  const code = readFileSync(join(FDIR, f, 'index.ts'), 'utf8');
  // Segredos: todos os .ts da pasta da edge (helpers em subpastas também), não só o index.ts.
  const fontes = arquivosTs(join(FDIR, f)).map((p) => readFileSync(p, 'utf8')).join('\n');
  const envs = [...new Set([...fontes.matchAll(/Deno\.env\.get\(\s*['"`]([A-Z0-9_]+)['"`]/g)].map((m) => m[1]))].sort();
  // `\b` deixava `foo` casar `/functions/v1/foo-bar`; o fim do nome exige um não-[A-Za-z0-9_-] ou fim de linha.
  const fimNome = '([^A-Za-z0-9_-]|$)';
  const url = `functions/v1/${q}${fimNome}`;
  // Aspa de fechamento OU `/` logo após o nome: cobre invoke(`nome/${acao}`).
  const src = rgFiles(`(functions\\.invoke\\(\\s*['"\`]${q}(['"\`]|/)|${url}|['"\`]${q}['"\`]\\s*[,)])`, ['src']);
  const migrations = rgFiles(url, ['supabase/migrations']);
  const outrasEdges = rgFiles(`${url}|['"\`]${q}['"\`]`, ['supabase/functions']).filter((p) => !p.startsWith(`supabase/functions/${f}/`));
  const e2e = rgFiles(q, ['e2e']);
  const ci = rgFiles(q, ['.github/workflows', 'supabase/config.toml']);
  inventario[f] = {
    linhas: code.split('\n').length,
    segredos_lidos: envs,
    chamada_em: { src: src.length, migrations: migrations.length, outras_edges: outrasEdges.length, e2e: e2e.length, ci_config: ci.length },
    sem_chamador: src.length + migrations.length + outrasEdges.length === 0,
  };
}
const semChamador = Object.entries(inventario).filter(([, v]) => v.sem_chamador).map(([k]) => k);
writeFileSync(join(OUT, 'edges.json'), JSON.stringify({ gerado_em: new Date().toISOString(), total: edges.length, sem_chamador_no_repo: semChamador, edge_functions: inventario }) + '\n');
console.log(`edges: ${edges.length} | sem chamador no repo (src/migrations/edges): ${semChamador.length}`);

// Le o fd 0 em laco proprio: sob runners que deixam o stdin em modo nao-bloqueante
// (ex. `node --test`), um unico `readFileSync(0)` pode lancar EAGAIN mesmo com dados
// reais ainda chegando no pipe -- e um catch que tratasse isso como "stdin vazio"
// descartaria esses dados em silencio. Em EAGAIN, espera um pouco (espera de
// verdade via Atomics.wait, sem busy-loop) e tenta de novo; só desiste depois de
// varias tentativas sem nenhum byte novo.
function lerStdinSync() {
  const pedacos = [];
  const buf = Buffer.alloc(65536);
  const relogio = new Int32Array(new SharedArrayBuffer(4));
  let tentativasSemDados = 0;
  const MAX_TENTATIVAS_SEM_DADOS = 50; // ~1s de espera total (20ms x 50)
  for (;;) {
    let lidos;
    try {
      lidos = readSync(0, buf, 0, buf.length, null);
    } catch (erro) {
      if (erro?.code === 'EAGAIN') {
        if (++tentativasSemDados > MAX_TENTATIVAS_SEM_DADOS) break;
        Atomics.wait(relogio, 0, 0, 20);
        continue;
      }
      if (erro?.code === 'EOF') break;
      throw erro;
    }
    if (lidos === 0) break;
    tentativasSemDados = 0;
    pedacos.push(Buffer.from(buf.subarray(0, lidos)));
  }
  return Buffer.concat(pedacos).toString('utf8');
}

if (!process.stdin.isTTY) {
  const nomes = lerStdinSync().split(/\s+/).filter(Boolean);
  if (nomes.length > 0) {
    const uso = {};
    for (const t of nomes) {
      const q = esc(t);
      uso[t] = {
        from_src: rgCount(`\\.from\\(\\s*['"\`]${q}['"\`]`, ['src']),
        from_edges: rgCount(`\\.from\\(\\s*['"\`]${q}['"\`]`, ['supabase/functions']),
        em_types_ts: rgCount(`^\\s+${q}: \\{`, ['src/integrations/supabase/types.ts']) > 0,
      };
    }
    const semFrom = Object.entries(uso).filter(([, v]) => v.from_src + v.from_edges === 0).map(([k]) => k);
    writeFileSync(join(OUT, 'tabelas-uso.json'), JSON.stringify({ gerado_em: new Date().toISOString(), total: nomes.length, sem_from_em_src_nem_edges: semFrom, tabelas: uso }) + '\n');
    console.log(`tabelas: ${nomes.length} | sem .from() em src nem edges: ${semFrom.length}`);
  }
}
