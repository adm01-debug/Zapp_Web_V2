#!/usr/bin/env node
/**
 * Inventario das rotas do front -> inventario/estado/rotas.json (fonte de consulta dos agentes).
 *
 * Le o codigo, nao documentacao:
 *  - URLs:  src/routes/AppRoutes.tsx (path, pagina, ProtectedRoute/requiredRoles, Navigate)
 *  - Telas: src/pages/ViewRouter.tsx (VIEW_MAP/SPECIAL_VIEWS, o `?view=` dentro de "/")
 *           + src/pages/lazyViews.ts (arquivo de cada tela)
 *           + src/services/navigation.service.ts (menu: rotulo, grupo, papeis, permissao, atalho)
 *  - Para cada tela: segue os imports a partir do arquivo da tela (mesma pasta de feature,
 *    src/hooks/ e src/services/) e lista hooks, edge functions invocadas, RPCs, tabelas (.from e
 *    /rest/v1) e buckets de storage (storage.from).
 *  - `problemas`: item de menu sem tela, tela sem item de menu, tela/URL sem arquivo e import local
 *    que nao resolve.
 *
 * Uso:
 *   node scripts/inventario/gerar-rotas.mjs           grava inventario/estado/rotas.json
 *   node scripts/inventario/gerar-rotas.mjs --check   exit 1 se o arquivo commitado esta desatualizado
 * Saida deterministica (sem data): o mesmo codigo gera o mesmo arquivo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAIDA_REL = 'inventario/estado/rotas.json';
const EXTENSOES = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

const ler = (raiz, rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const rel = (raiz, abs) => path.relative(raiz, abs).split(path.sep).join('/');
const unico = (lista) => [...new Set(lista)].sort();

/** Resolve um especificador de import para um arquivo do repo (ou null se externo/inexistente). */
export function resolverImport(raiz, deArquivoAbs, especificador) {
  let base;
  if (especificador.startsWith('@/')) base = path.join(raiz, 'src', especificador.slice(2));
  else if (especificador.startsWith('.')) base = path.resolve(path.dirname(deArquivoAbs), especificador);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSOES) if (fs.existsSync(base + ext)) return base + ext;
  return undefined; // local, mas nao existe
}

/** Imports de um arquivo: [{ especificador, nomes[] }] (estaticos e import() dinamico). */
export function extrairImports(texto) {
  const out = [];
  for (const m of texto.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    if (m[1]) continue;
    const nomes = [...m[2].matchAll(/\b([A-Za-z_$][\w$]*)\b(?!\s*as\b)/g)].map((x) => x[1])
      .filter((n) => !['type', 'as', 'default'].includes(n));
    out.push({ especificador: m[3], nomes });
  }
  for (const m of texto.matchAll(/(?:import|export)\s*(?:\*\s*from\s*)?['"]([^'"]+)['"]/g)) out.push({ especificador: m[1], nomes: [] });
  for (const m of texto.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ especificador: m[1], nomes: [] });
  for (const m of texto.matchAll(/export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g)) out.push({ especificador: m[1], nomes: [] });
  return out;
}

/**
 * Mapa nome -> valor dos `const NOME = 'literal'` (ou `export const`) de nivel de modulo no texto.
 * So resolve o caso mais comum do repo: identificador passado direto pra `.from`/`fromTable`/
 * `storage.from`/`rpc`/`invoke` que e, no mesmo arquivo, uma constante de string (ex.:
 * `TALKX_MEDIA_BUCKET`, `ACL_ALERTS_TABLE`). Nao resolve parametro de funcao nem ternario.
 * `^` sem `\s*` antes de `const` e de proposito: exige coluna zero (nivel de modulo de
 * verdade), senao um `const` indentado dentro de funcao (nivel de bloco) tambem bate e, se
 * duas funcoes do mesmo arquivo tiverem uma const local com o mesmo nome e valores diferentes,
 * a ultima declaracao "vence" para as DUAS chamadas (falso positivo silencioso em tabelas/rpcs).
 */
function constantesDeString(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(/^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*['"`]([A-Za-z0-9_.-]+)['"`]\s*[;,]?\s*$/gm)) {
    mapa.set(m[1], m[2]);
  }
  return mapa;
}

/**
 * Chamadas ao Supabase num texto: tabelas (`.from` do cliente, `fromTable` de
 * src/lib/supabaseHelpers.ts e `/rest/v1/<tabela>`), buckets (`storage.from`), RPCs (`.rpc`) e
 * edges (`functions.invoke`, `invokeEdge`, `/functions/v1/<edge>`).
 */
export function extrairChamadas(texto) {
  const pegar = (re) => [...texto.matchAll(re)].map((m) => m[1]);
  const consts = constantesDeString(texto);
  const tabelas = [];
  const buckets = [];
  for (const m of texto.matchAll(/(\bstorage\s*)?\.from\(\s*['"`]([A-Za-z0-9_-]+)['"`]/g)) (m[1] ? buckets : tabelas).push(m[2]);
  for (const m of texto.matchAll(/(\bstorage\s*)?\.from\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    if (consts.has(m[2])) (m[1] ? buckets : tabelas).push(consts.get(m[2]));
  }
  // `fromTable('x')` / `fromTable(CONST)` — atalho tipado de src/lib/supabaseHelpers.ts, sempre tabela.
  for (const m of texto.matchAll(/\bfromTable\(\s*['"`]([A-Za-z0-9_-]+)['"`]/g)) tabelas.push(m[1]);
  for (const m of texto.matchAll(/\bfromTable\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    if (consts.has(m[1])) tabelas.push(consts.get(m[1]));
  }
  tabelas.push(...pegar(/\/rest\/v1\/([A-Za-z0-9_]+)/g).filter((t) => t !== 'rpc'));
  return {
    tabelas,
    buckets,
    // `.rpc('x')` e o apelido `const rpc = supabase.rpc.bind(...)` + `rpc('x')`.
    rpcs: [...pegar(/(?:\.|\b)rpc\(\s*['"`]([A-Za-z0-9_]+)['"`]/g), ...pegar(/\/rest\/v1\/rpc\/([A-Za-z0-9_]+)/g)],
    // `functions.invoke` (inclusive quebrado em linha) e o atalho `invokeEdge<T>(...)` de
    // src/lib/invokeEdge.ts; `invoke('evolution-api/connect')` conta como a edge `evolution-api`.
    // `fetch(`${SUPABASE_URL}/functions/v1/get-call-recording`)` (chamada direta pela URL): so dentro
    // de string/template; a URL mostrada como texto em JSX (ex.: GmailWebhookMonitor) nao e chamada.
    edges: [
      ...pegar(/(?:functions\s*\.\s*invoke|\binvokeEdge)(?:<[^>()]*>)?\(\s*['"`]([A-Za-z0-9_-]+)(?:\/[^'"`]*)?['"`]/g),
      ...pegar(/['"`][^'"`\n]*\/functions\/v1\/([A-Za-z0-9_-]+)/g),
    ],
  };
}

const ehTeste = (p) => /(\.test\.|\.spec\.|__tests__|\.stories\.)/.test(p);

/**
 * Fecho de imports a partir do arquivo da tela. Segue sem limite a pasta da feature da tela,
 * src/hooks/, src/services/, src/lib/ e src/features/ (helpers que chamam edge/RPC, ex.:
 * callCRMIntegration, mapboxToken); componentes de OUTRA feature em src/components/ (ex.: a aba
 * Filas da Supervisão renderiza QueuesView) entram ate MAX_SALTOS_FEATURE saltos. Fica de fora
 * so o kit de UI (src/components/ui/) e teste. Import local que nao resolve vira problema.
 */
export const MAX_SALTOS_FEATURE = 2;
export function fechoDaTela(raiz, arquivoTelaAbs) {
  const pastaFeature = path.dirname(arquivoTelaAbs);
  const dentro = (abs, rel_) => abs.startsWith(path.join(raiz, rel_) + path.sep);
  const livre = (abs) => abs.startsWith(pastaFeature + path.sep) || ['src/hooks', 'src/services', 'src/lib', 'src/features'].some((d) => dentro(abs, d));
  const outraFeature = (abs) => dentro(abs, 'src/components') && !dentro(abs, 'src/components/ui');
  const saltosVistos = new Map(); // arquivo -> menor numero de saltos com que foi visitado
  const hooks = new Map();
  const quebrados = new Set();
  const chamadas = { tabelas: [], buckets: [], rpcs: [], edges: [] };
  const fila = [[arquivoTelaAbs, 0]];
  while (fila.length) {
    const [atual, saltos] = fila.shift();
    if (saltosVistos.has(atual) && saltosVistos.get(atual) <= saltos) continue;
    const primeiraVez = !saltosVistos.has(atual);
    saltosVistos.set(atual, saltos);
    const texto = fs.readFileSync(atual, 'utf8');
    if (primeiraVez) {
      const c = extrairChamadas(texto);
      for (const k of Object.keys(chamadas)) chamadas[k].push(...c[k]);
    }
    for (const imp of extrairImports(texto)) {
      const alvo = resolverImport(raiz, atual, imp.especificador);
      if (alvo === undefined && !/\.(css|scss|svg|png|jpe?g|webp|gif|json)(\?.*)?$|\?/.test(imp.especificador)) {
        quebrados.add(`${rel(raiz, atual)} -> ${imp.especificador}`);
      }
      if (!alvo || ehTeste(alvo)) continue;
      for (const nome of imp.nomes) if (/^use[A-Z]/.test(nome) && !hooks.has(nome)) hooks.set(nome, rel(raiz, alvo));
      if (livre(alvo)) fila.push([alvo, saltos]);
      else if (outraFeature(alvo) && saltos < MAX_SALTOS_FEATURE) fila.push([alvo, saltos + 1]);
    }
  }
  return {
    arquivos_lidos: saltosVistos.size,
    hooks: [...hooks.entries()].map(([nome, arquivo]) => ({ nome, arquivo })).sort((a, b) => a.nome.localeCompare(b.nome)),
    buckets: unico(chamadas.buckets),
    edges: unico(chamadas.edges),
    rpcs: unico(chamadas.rpcs),
    tabelas: unico(chamadas.tabelas),
    imports_quebrados: [...quebrados].sort(),
  };
}

/** URLs do react-router em AppRoutes.tsx. */
export function lerUrls(raiz) {
  const arquivo = 'src/routes/AppRoutes.tsx';
  const texto = ler(raiz, arquivo);
  const abs = path.join(raiz, arquivo);
  const lazy = Object.fromEntries([...texto.matchAll(/const\s+(\w+)\s*=\s*lazy\w*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => [m[1], m[2]]));
  const corpo = texto.slice(texto.indexOf('<Routes>'), texto.indexOf('</Routes>'));
  return corpo.split(/<Route\b/).slice(1).map((pedaco) => {
    const caminho = (pedaco.match(/path(?:=|:\s*)["']([^"']+)["']/) || [])[1];
    const redireciona = (pedaco.match(/<Navigate\s+to=["']([^"']+)["']/) || [])[1] ?? null;
    const componente = [...pedaco.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1])
      .find((n) => !['ProtectedRoute', 'Navigate', 'Route', 'Suspense', 'ErrorBoundary'].includes(n)) ?? null;
    const papeis = ((pedaco.match(/requiredRoles=\{\[([^\]]*)\]\}/) || [])[1] || '')
      .match(/['"]([^'"]+)['"]/g)?.map((s) => s.slice(1, -1)) ?? [];
    const alvo = componente && lazy[componente] ? resolverImport(raiz, abs, lazy[componente]) : null;
    return {
      caminho,
      componente,
      arquivo: alvo ? rel(raiz, alvo) : null,
      protegida: pedaco.includes('<ProtectedRoute'),
      papeis,
      redireciona,
    };
  }).filter((u) => u.caminho).sort((a, b) => a.caminho.localeCompare(b.caminho));
}

/** Itens de menu do NavigationService: id -> { rotulo, grupo, secao, papeis, permissao, atalho, layout }. */
export function lerMenu(raiz) {
  const texto = ler(raiz, 'src/services/navigation.service.ts');
  const constPapeis = Object.fromEntries([...texto.matchAll(/const\s+(\w+)\s*:\s*AppRole\[\]\s*=\s*\[([^\]]*)\]/g)]
    .map((m) => [m[1], (m[2].match(/['"]([^'"]+)['"]/g) || []).map((s) => s.slice(1, -1))]));
  const constTexto = Object.fromEntries([...texto.matchAll(/const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
  const secoes = [...texto.matchAll(/static\s+(get\w+Nav|getGroups)\s*\(/g)].map((m) => ({ nome: m[1], inicio: m.index }));
  const menu = {};
  for (let i = 0; i < secoes.length; i += 1) {
    const bloco = texto.slice(secoes[i].inicio, secoes[i + 1]?.inicio ?? texto.length);
    const fim = bloco.search(/\n\s{2}static\s/);
    const corpo = fim > 0 ? bloco.slice(0, fim) : bloco;
    const grupos = [...corpo.matchAll(/label:\s*'([^']+)',\s*\n\s*icon:\s*\w+,\s*\n\s*items:/g)].map((m) => ({ label: m[1], pos: m.index }));
    for (const m of corpo.matchAll(/\{\s*id:\s*'([^']+)'([^}]*)\}/g)) {
      const attrs = m[2];
      const pegar = (re) => (attrs.match(re) || [])[1];
      const papeisRef = pegar(/roles:\s*(\w+)/);
      const permissaoRef = pegar(/permission:\s*(\w+|'[^']+')/);
      const grupo = grupos.filter((g) => g.pos < m.index).pop()?.label ?? null;
      menu[m[1]] = {
        rotulo: pegar(/label:\s*'([^']+)'/) ?? null,
        secao: secoes[i].nome.replace(/^get/, '').replace(/Nav$/, '').toLowerCase(),
        grupo,
        papeis: papeisRef ? (constPapeis[papeisRef] ?? [papeisRef]) : [],
        permissao: permissaoRef ? (permissaoRef.startsWith("'") ? permissaoRef.slice(1, -1) : (constTexto[permissaoRef] ?? permissaoRef)) : null,
        atalho: pegar(/shortcut:\s*'([^']+)'/) ?? null,
        layout: pegar(/layout:\s*'([^']+)'/) ?? null,
      };
    }
  }
  return menu;
}

/** Telas do ViewRouter (VIEW_MAP + SPECIAL_VIEWS) com o arquivo de cada uma. */
export function lerTelas(raiz) {
  const router = ler(raiz, 'src/pages/ViewRouter.tsx');
  const lazyRel = fs.existsSync(path.join(raiz, 'src/pages/lazyViews.ts')) ? 'src/pages/lazyViews.ts' : 'src/pages/lazyViews.tsx';
  const lazyAbs = path.join(raiz, lazyRel);
  const lazyTexto = fs.readFileSync(lazyAbs, 'utf8');
  const componentes = {};
  for (const m of lazyTexto.matchAll(/export\s+const\s+(\w+)\s*=\s*[\s\S]*?import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!(m[1] in componentes)) componentes[m[1]] = m[2];
  }
  const mapa = router.slice(router.indexOf('VIEW_MAP'), router.indexOf('SPECIAL_VIEWS'));
  const especiais = router.slice(router.indexOf('SPECIAL_VIEWS'), router.indexOf('export function ViewRouter'));
  const telas = [];
  for (const m of mapa.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*Views\.(\w+)/g)) telas.push({ id: m[1], componente: m[2], especial: false });
  for (const m of especiais.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*\([^)]*\)\s*=>[\s\S]*?<Views\.(\w+)/g)) telas.push({ id: m[1], componente: m[2], especial: true });
  return telas.map((t) => {
    const esp = componentes[t.componente];
    const alvo = esp ? resolverImport(raiz, lazyAbs, esp) : null;
    return { ...t, arquivo: alvo ? rel(raiz, alvo) : null };
  });
}

/** Monta o inventario inteiro a partir de uma raiz de repo. */
export function gerarRotas(raiz = RAIZ_PADRAO) {
  const urls = lerUrls(raiz);
  const menu = lerMenu(raiz);
  const telasBase = lerTelas(raiz);
  const idsTela = new Set(telasBase.map((t) => t.id));
  const telas = telasBase.map((t) => ({
    id: t.id,
    url: `/?view=${t.id}`,
    componente: t.componente,
    arquivo: t.arquivo,
    especial: t.especial,
    menu: menu[t.id] ?? null,
    ...(t.arquivo ? fechoDaTela(raiz, path.join(raiz, t.arquivo)) : { arquivos_lidos: 0, hooks: [], buckets: [], edges: [], rpcs: [], tabelas: [], imports_quebrados: [] }),
  })).sort((a, b) => a.id.localeCompare(b.id));

  const hooks = {};
  for (const t of telas) for (const h of t.hooks) {
    hooks[h.nome] ??= { arquivo: h.arquivo, telas: [] };
    hooks[h.nome].telas.push(t.id);
  }

  const problemas = [
    ...Object.keys(menu).filter((id) => !idsTela.has(id)).sort()
      .map((id) => ({ tipo: 'menu_sem_tela', id, detalhe: `item "${menu[id].rotulo}" no menu sem entrada no ViewRouter (cai no FallbackView)` })),
    ...telas.filter((t) => !t.menu).map((t) => ({ tipo: 'tela_sem_menu', id: t.id, detalhe: 'sem item no NavigationService: canAccess nega por padrao, salvo gate proprio' })),
    ...telas.filter((t) => !t.arquivo).map((t) => ({ tipo: 'tela_sem_arquivo', id: t.id, detalhe: `${t.componente} nao resolve em lazyViews` })),
    ...urls.filter((u) => u.componente && !u.arquivo && !u.redireciona).map((u) => ({ tipo: 'url_sem_arquivo', id: u.caminho, detalhe: `${u.componente} nao resolve em AppRoutes` })),
    ...telas.flatMap((t) => t.imports_quebrados.map((q) => ({ tipo: 'import_quebrado', id: t.id, detalhe: q }))),
  ];

  return {
    format_version: 1,
    fonte: 'scripts/inventario/gerar-rotas.mjs (le AppRoutes.tsx, ViewRouter.tsx, lazyViews.ts, navigation.service.ts e os imports de cada tela)',
    resumo: {
      urls: urls.length,
      telas: telas.length,
      itens_de_menu: Object.keys(menu).length,
      hooks_distintos: Object.keys(hooks).length,
      problemas: problemas.length,
    },
    urls,
    telas,
    hooks: Object.fromEntries(Object.keys(hooks).sort().map((k) => [k, { arquivo: hooks[k].arquivo, telas: unico(hooks[k].telas) }])),
    problemas,
  };
}

export const serializar = (inv) => JSON.stringify(inv, null, 2) + '\n';

function main(argv) {
  const saida = path.join(RAIZ_PADRAO, SAIDA_REL);
  const conteudo = serializar(gerarRotas(RAIZ_PADRAO));
  if (argv.includes('--check')) {
    const atual = fs.existsSync(saida) ? fs.readFileSync(saida, 'utf8') : '';
    if (atual !== conteudo) {
      console.error(`${SAIDA_REL} desatualizado: rode node scripts/inventario/gerar-rotas.mjs e commite o resultado.`);
      process.exit(1);
    }
    console.log(`${SAIDA_REL} em dia.`);
    return;
  }
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, conteudo);
  const r = JSON.parse(conteudo).resumo;
  console.log(`rotas.json: ${r.urls} URLs, ${r.telas} telas, ${r.itens_de_menu} itens de menu, ${r.hooks_distintos} hooks, ${r.problemas} problemas.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
