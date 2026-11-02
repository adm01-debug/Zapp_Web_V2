#!/usr/bin/env node
/**
 * O inventario mudou de verdade? Compara cada arquivo de inventario/estado/ com a versao do
 * HEAD depois de tirar so os carimbos de data (`medido_em`, `gerado_em`, em qualquer nivel).
 * Imprime `true` ou `false` (usado pelo inventario-estado-semanal.yml para decidir se abre PR).
 *
 * Uso: node scripts/inventario/mudou-conteudo.mjs [arquivo...]   (padrao: banco, rotas e edges)
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PADRAO = ['inventario/estado/banco.json', 'inventario/estado/rotas.json', 'inventario/estado/edges.json'];
const CARIMBOS = new Set(['medido_em', 'gerado_em']);

/** JSON canonico sem os carimbos de data. Texto que nao e JSON volta como esta. */
export function semCarimbos(texto) {
  if (texto === null) return null;
  let dado;
  try { dado = JSON.parse(texto); } catch { return texto; }
  const limpar = (v) => {
    if (Array.isArray(v)) return v.map(limpar);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).filter((k) => !CARIMBOS.has(k)).sort().map((k) => [k, limpar(v[k])]));
    }
    return v;
  };
  return JSON.stringify(limpar(dado));
}

/** true se algum arquivo mudou alem dos carimbos (arquivo novo ou apagado conta). */
export function mudou(arquivos, lerAntes, lerDepois) {
  return arquivos.some((f) => semCarimbos(lerAntes(f)) !== semCarimbos(lerDepois(f)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arquivos = process.argv.length > 2 ? process.argv.slice(2) : PADRAO;
  const lerAntes = (f) => {
    try { return execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
  const lerDepois = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  console.log(String(mudou(arquivos, lerAntes, lerDepois)));
}
