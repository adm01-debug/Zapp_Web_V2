// Contrato de scripts/inventario/gerar-rotas.mjs (inventario/estado/rotas.json).
// 1) Num repo de brinquedo: URLs, telas, menu, fecho de imports (hooks/edges/rpcs/tabelas)
//    e problemas saem do codigo.
// 2) No repo real: toda tela resolve para um arquivo que existe, e a parte estrutural do
//    rotas.json commitado (URLs, telas, menu, problemas) bate com o codigo atual. Os
//    detalhes do fecho (hooks/edges/tabelas) mudam a cada refactor de hook e sao
//    regerados pela atualizacao semanal — nao travam PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gerarRotas, extrairChamadas, extrairImports } from '../inventario/gerar-rotas.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function repoDeBrinquedo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-rotas-'));
  const escrever = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), txt); };
  escrever('src/routes/AppRoutes.tsx', `
const Index = lazyWithRetry(() => import("../pages/Index"));
const Admin = lazyWithRetry(() => import("../pages/Admin"));
export function AppRoutes() { return (
  <Routes>
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route
      path="/admin"
      element={
        <ProtectedRoute requiredRoles={["admin"]}>
          <Admin />
        </ProtectedRoute>
      }
    />
    <Route path="/velha" element={<Navigate to="/?view=a" replace />} />
  </Routes>); }`);
  escrever('src/pages/Index.tsx', 'export default function Index() { return null; }');
  escrever('src/pages/Admin.tsx', 'export default function Admin() { return null; }');
  escrever('src/pages/lazyViews.ts', `
export const AView = lazyWithRetry(() => import('@/components/a/AView').then(m => ({ default: m.AView })));
export const BView = lazyWithRetry(() => import('@/components/b/BView').then(m => ({ default: m.BView })));
export const Sumida = lazyWithRetry(() => import('@/components/nao/Existe').then(m => ({ default: m.X })));`);
  escrever('src/pages/ViewRouter.tsx', `
import * as Views from './lazyViews';
const VIEW_MAP = {
  'a': Views.AView,
  'sumida': Views.Sumida,
};
const SPECIAL_VIEWS = {
  'b': (props) => (
    <Wrap><Views.BView userId={props.userId} /></Wrap>
  ),
};
export function ViewRouter() { return null; }`);
  escrever('src/services/navigation.service.ts', `
const STAFF_ROLES: AppRole[] = ['admin', 'supervisor'];
const PERM = 'a.ver';
export class NavigationService {
  static getPrimaryNav(): NavItem[] {
    return [
      { id: 'a', icon: X, label: 'Tela A', shortcut: 'Alt+A', permission: PERM },
      { id: 'fantasma', icon: X, label: 'Sem tela' },
    ];
  }

  static getGroups(): NavGroup[] {
    return [
      {
        label: 'Grupo B',
        icon: Y,
        items: [
          { id: 'b', icon: Z, label: 'Tela B', roles: STAFF_ROLES },
        ],
      },
    ];
  }
}`);
  escrever('src/components/a/AView.tsx', `
import { useCoisa } from '@/hooks/useCoisa';
import { Filho } from './Filho';
import { Painel } from './Painel';
import { Button } from '@/components/ui/button';
export function AView() { useCoisa(); return null; }`);
  escrever('src/components/a/Filho.tsx', "export const Filho = () => supabase.functions.invoke('edge-a'); supabase.functions.invoke('edge-sub/acao');\nconst rpc = supabase.rpc.bind(supabase); rpc('rpc_por_apelido');");
  escrever('src/components/a/Painel.tsx', "export const Painel = () => <code>\n  {SUPABASE_URL}/functions/v1/so-mostrada\n</code>;");
  escrever('src/components/a/Filho.test.tsx', "supabase.from('so_no_teste')");
  escrever('src/components/ui/button.tsx', "supabase.from('nao_e_da_feature')");
  escrever('src/hooks/useCoisa.ts', `
import { servico } from '@/services/servico';
export function useCoisa() { fetch(\`\${URL}/functions/v1/edge-por-url?x=1\`); fetch(\`\${URL}/functions/v1/\${nome}\`); return supabase.from('coisas').select(); }`);
  escrever('src/services/servico.ts', "import { ajudante } from '@/lib/ajudante';\nexport const servico = () => supabase.rpc('fn_servico');");
  escrever('src/lib/ajudante.ts', "export const ajudante = () => invokeEdge('edge-da-lib');");
  escrever('src/components/b/BView.tsx', "import { Aba } from '@/components/c/Aba';\nimport { Some } from './nao-existe';\nimport './estilo.css';\nexport function BView() { return null; }");
  escrever('src/components/c/Aba.tsx', "import { Neta } from './Neta';\nexport const Aba = () => db.from('de_outra_feature');");
  escrever('src/components/c/Neta.tsx', "import { Longe } from '@/components/d/Longe';\nexport const Neta = () => db.from('neta_da_outra_feature');");
  escrever('src/components/d/Longe.tsx', "export const Longe = () => db.from('alem_do_limite');");
  return dir;
}

test('repo de brinquedo: URLs, telas, menu, fecho e problemas saem do codigo', () => {
  const dir = repoDeBrinquedo();
  const inv = gerarRotas(dir);
  const urls = Object.fromEntries(inv.urls.map((u) => [u.caminho, u]));
  assert.deepEqual(urls['/'], { caminho: '/', componente: 'Index', arquivo: 'src/pages/Index.tsx', protegida: true, papeis: [], redireciona: null });
  assert.deepEqual(urls['/admin'].papeis, ['admin']);
  assert.equal(urls['/admin'].arquivo, 'src/pages/Admin.tsx');
  assert.equal(urls['/velha'].redireciona, '/?view=a');

  const telas = Object.fromEntries(inv.telas.map((t) => [t.id, t]));
  assert.equal(telas.a.arquivo, 'src/components/a/AView.tsx');
  assert.deepEqual(telas.a.menu, { rotulo: 'Tela A', secao: 'primary', grupo: null, papeis: [], permissao: 'a.ver', atalho: 'Alt+A', layout: null });
  assert.deepEqual(telas.a.hooks, [{ nome: 'useCoisa', arquivo: 'src/hooks/useCoisa.ts' }]);
  assert.deepEqual(telas.a.edges, ['edge-a', 'edge-da-lib', 'edge-por-url', 'edge-sub'],
    "invoke('edge-sub/acao') conta como edge-sub; segue service -> src/lib; fetch em /functions/v1/<edge> conta; URL dinamica e URL so mostrada em JSX nao");
  assert.deepEqual(telas.a.rpcs, ['fn_servico', 'rpc_por_apelido'], 'segue hook -> service e pega rpc por apelido');
  assert.deepEqual(telas.a.tabelas, ['coisas'], 'ignora teste e componente compartilhado de UI');
  assert.equal(telas.b.especial, true);
  assert.deepEqual(telas.b.tabelas, ['de_outra_feature', 'neta_da_outra_feature'],
    'componente de outra feature entra ate 2 saltos; o terceiro (alem_do_limite) fica de fora');
  assert.deepEqual(telas.b.imports_quebrados, ['src/components/b/BView.tsx -> ./nao-existe'], 'css nao conta como quebrado');
  assert.equal(telas.b.menu.grupo, 'Grupo B');
  assert.deepEqual(telas.b.menu.papeis, ['admin', 'supervisor']);
  assert.deepEqual(inv.hooks.useCoisa, { arquivo: 'src/hooks/useCoisa.ts', telas: ['a'] });

  const problemas = inv.problemas.map((p) => `${p.tipo}:${p.id}`).sort();
  assert.deepEqual(problemas, ['import_quebrado:b', 'menu_sem_tela:fantasma', 'tela_sem_arquivo:sumida', 'tela_sem_menu:sumida']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('extratores: imports nomeados/dinamicos e chamadas ao Supabase', () => {
  const imps = extrairImports("import { useA, type T, useB as apelido } from '@/hooks/x';\nimport type { Z } from './z';\nconst m = import('./lazy');");
  assert.ok(imps.some((i) => i.especificador === '@/hooks/x' && i.nomes.includes('useA')));
  assert.ok(!imps.some((i) => i.especificador === './z' && i.nomes.length), 'import type nao conta');
  assert.ok(imps.some((i) => i.especificador === './lazy'));
  assert.deepEqual(extrairChamadas("db.from(`t1`); db.rpc('r1'); supabase.functions.invoke(\"e-1\", {})"),
    { tabelas: ['t1'], buckets: [], rpcs: ['r1'], edges: ['e-1'] });
  assert.deepEqual(
    extrairChamadas("supabase.storage.from('stickers').upload(); supabase.storage\n  .from('fotos'); db.from('stickers');"
      + " fetch(`${u}/rest/v1/so_rest?x=1`); fetch(`${u}/rest/v1/rpc/fn_rest`)"),
    { tabelas: ['stickers', 'so_rest'], buckets: ['stickers', 'fotos'], rpcs: ['fn_rest'], edges: [] },
    'storage.from e bucket, nao tabela; /rest/v1 conta tabela e rpc');
  assert.deepEqual(
    extrairChamadas("invokeEdge('message-delivery', {}); invokeEdge<{ ok: boolean }>(\"generico\"); supabase.functions\n  .invoke('quebrada');"
      + " invokeMultiplixDispatch('acao_nao_e_edge')").edges,
    ['message-delivery', 'generico', 'quebrada'], 'atalho invokeEdge (com generico) e invoke quebrado em linha');
});

test('repo real: toda URL e tela resolve para arquivo existente e o menu tem o tamanho esperado', () => {
  const inv = gerarRotas(raiz);
  assert.ok(inv.urls.length >= 10, `poucas URLs: ${inv.urls.length}`);
  assert.ok(inv.telas.length >= 40, `poucas telas: ${inv.telas.length}`);
  for (const t of inv.telas) assert.ok(t.arquivo && fs.existsSync(path.join(raiz, t.arquivo)), `tela ${t.id} sem arquivo`);
  for (const u of inv.urls.filter((x) => !x.redireciona && x.componente)) assert.ok(u.arquivo, `URL ${u.caminho} sem arquivo`);
  const nav = fs.readFileSync(path.join(raiz, 'src/services/navigation.service.ts'), 'utf8');
  assert.equal(inv.resumo.itens_de_menu, (nav.match(/\{\s*id:\s*'/g) || []).length, 'todo item do NavigationService entrou');
  assert.ok(inv.telas.find((t) => t.id === 'inbox').hooks.length > 10, 'fecho da tela inbox achou hooks');
});

test('rotas.json commitado esta em dia na parte estrutural (rode node scripts/inventario/gerar-rotas.mjs)', () => {
  const estrutura = (inv) => ({
    urls: inv.urls,
    telas: inv.telas.map(({ id, url, componente, arquivo, especial, menu }) => ({ id, url, componente, arquivo, especial, menu })),
    problemas: inv.problemas,
  });
  const commitado = JSON.parse(fs.readFileSync(path.join(raiz, 'inventario/estado/rotas.json'), 'utf8'));
  assert.deepEqual(estrutura(commitado), estrutura(gerarRotas(raiz)),
    'inventario/estado/rotas.json desatualizado: rode node scripts/inventario/gerar-rotas.mjs e commite');
});

test('extrairChamadas resolve fromTable literal e const de string do mesmo arquivo', () => {
  const texto = `
export const ACL_ALERTS_TABLE = 'security_acl_alerts';
const TALKX_MEDIA_BUCKET = 'talkx-media';
export function f() {
  fromTable('user_sessions').select('id');
  fromTable(ACL_ALERTS_TABLE).select('*');
  supabase.storage.from(TALKX_MEDIA_BUCKET).remove(['x']);
  supabase.storage.from(NAO_EXISTE).remove(['y']);
}`;
  const c = extrairChamadas(texto);
  assert.deepEqual(c.tabelas.sort(), ['security_acl_alerts', 'user_sessions']);
  assert.deepEqual(c.buckets, ['talkx-media']);
});

test('constantesDeString ignora const de bloco/funcao: nao mistura valor entre duas funcoes do mesmo arquivo', () => {
  const texto = `
export function handlerA() {
  const TABELA = 'tabela_a';
  return supabase.from(TABELA).select();
}
export function handlerB() {
  const TABELA = 'tabela_b';
  return supabase.from(TABELA).select();
}`;
  // Antes do fix, `^\s*const` casava a const indentada dentro da funcao como se fosse de
  // nivel de modulo; a ULTIMA declaracao do arquivo (tabela_b) sobrescrevia o mapa e as DUAS
  // chamadas resolviam para 'tabela_b' (falso positivo silencioso: handlerA nunca usa tabela_a
  // no inventario, e tabela_a nem aparece). Com `^` exigindo coluna zero, nenhuma das duas
  // consts de bloco resolve — o inventario corretamente nao finge saber a tabela.
  assert.deepEqual(extrairChamadas(texto).tabelas, [],
    'const declarada dentro de funcao nao e nivel de modulo: nao deve resolver nem misturar valor entre escopos');
});
