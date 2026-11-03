// Teste do gerador de contexto (scripts/ai-context/gerar.mjs).
// Monta um repositório sintético em pasta temporária cobrindo os casos que o gerador precisa
// entender (rotas aninhadas, lazy, menu, hooks, edge functions, migrations em ordem,
// barrel re-export, backend HTTP, Python, nested tsconfig) e confere a saída.
// Rodar: node --test scripts/ai-context/gerar.unit.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GERADOR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'gerar.mjs');
const w = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-ia-'));
  w(root, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { dev: 'vite', test: 'vitest run', audit: 'node scripts/audit.mjs' }, dependencies: { react: '18', 'react-router-dom': '6', '@supabase/supabase-js': '2', express: '4', stripe: '14' }, devDependencies: { vitest: '1', typescript: '5', vite: '5' } }));
  w(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, paths: { '@/*': ['./src/*'] } } }));
  w(root, '.env.example', 'VITE_SUPABASE_URL=\nVITE_API_KEY=\n');
  w(root, 'README.md', '# Fixture\n');
  w(root, 'src/main.tsx', `import { QueryClientProvider } from '@tanstack/react-query';\nimport { AppRoutes } from '@/routes/AppRoutes';\nexport const Root = () => <QueryClientProvider><AppRoutes/></QueryClientProvider>;`);
  w(root, 'src/routes/AppRoutes.tsx', `import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Login from '@/pages/Login';
import { lazy } from 'react';
const Admin = lazy(() => import('@/pages/admin/Admin'));
export function AppRoutes() {
  return (<Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/app" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
      <Route index element={<Home />} />
      <Route path="contacts/:id" element={<ContactPage />} />
    </Route>
    <Route path="/admin" element={<Admin />} />
    <Route {...{ path: '/access-denied' }} element={<Login />} />
    <Route path="/old" element={<Navigate to="/app" />} />
  </Routes>);
}
import { Shell } from '@/components/layout/Shell';
import { Home } from '@/components/home/Home';
import { ContactPage } from '@/components/contacts/ContactPage';`);
  w(root, 'src/components/auth/ProtectedRoute.tsx', `export const ProtectedRoute = ({ children }) => <>{children}</>;`);
  w(root, 'src/components/layout/Shell.tsx', `import { Outlet } from 'react-router-dom';\nexport const Shell = () => <div><Outlet/></div>;`);
  w(root, 'src/pages/ViewRouter.tsx', `import * as Views from '@/pages/lazyViews';\nconst VIEW_MAP = { home: Views.HomeLazy };\nconst SPECIAL_VIEWS = {\n  'achievements': (props) => (\n    <Boundary><Views.AchievementsLazy userId={props.userId} /></Boundary>\n  ),\n};\nexport const ViewRouter = ({ v }) => SPECIAL_VIEWS[v] ? SPECIAL_VIEWS[v]({}) : null;`);
  w(root, 'src/pages/lazyViews.ts', `import { lazy } from 'react';\nexport const HomeLazy = lazy(() => import('@/components/home/Home').then(m => ({ default: m.Home })));\nexport const AchievementsLazy = lazy(() => import('@/components/achievements/Achievements'));`);
  w(root, 'src/components/achievements/Achievements.tsx', `export default function Achievements() { return <ol/>; }`);
  w(root, 'src/components/layout/sidebarNav.ts', `const STAFF: string[] = ['admin', 'supervisor'];\nexport const sidebarGroups = [{ title: 'Principal', items: [{ id: 'home', label: 'Início', path: '/app' }, { id: 'contacts', label: 'Contatos', path: '/app/contacts/:id', roles: ['admin'] }, { id: 'staff', label: 'Equipe', path: '/admin', roles: STAFF }, { id: 'x', label: 'Externo', path: '/login', roles: EXTERNAL }, { id: 'ghost', label: 'Fantasma', path: '/nada' }] }];`);
  w(root, 'src/components/home/Home.tsx', `import { useContacts } from '@/hooks/useContacts';\nexport const Home = () => { const c = useContacts(); return <div>{c.length}</div>; };`);
  w(root, 'src/components/contacts/ContactPage.tsx', `import { Card } from '@/components/ui';\nimport { useContacts } from '@/hooks/useContacts';\nexport const ContactPage = () => { useContacts(); return <Card/>; };`);
  w(root, 'src/components/ui/index.ts', `export { Card } from './Card';\nexport * from './Button';`);
  w(root, 'src/components/ui/Card.tsx', `export const Card = () => <div/>;`);
  w(root, 'src/components/ui/Button.tsx', `export const Button = () => <button/>;`);
  w(root, 'src/components/ui/Unused.tsx', `export const Unused = () => <i/>;`);
  w(root, 'src/pages/Login.tsx', `export default function Login() { return <form/>; }`);
  w(root, 'src/pages/admin/Admin.tsx', `import { supabase } from '@/lib/supabase';\nexport const Admin = () => { const role = 'admin'; if (role === 'admin') supabase.rpc('is_admin'); return <div/>; };`);
  w(root, 'src/hooks/useContacts.ts', `import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
export function useContacts() { return useQuery(['c'], async () => { const { data } = await supabase.from('contacts').select('*'); await supabase.functions.invoke('send-email', { body: {} }); return data; }); }`);
  w(root, 'src/lib/supabase.ts', `import { createClient } from '@supabase/supabase-js';\nexport const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_ANON);\nconst flag = isFeatureEnabled('novo-inbox');`);
  w(root, 'src/hooks/__tests__/useContacts.test.ts', `import { useContacts } from '../useContacts';\nit('x', () => {}); test('y', () => {});`);
  w(root, 'server/api.ts', `import express from 'express';\nconst app = express();\napp.get('/health', (req, res) => res.send('ok'));\napp.post('/webhook/stripe', handler);`);
  w(root, 'backend/app.py', `from fastapi import FastAPI\nimport os\nfrom . import models\napp = FastAPI()\n@app.get('/items')\ndef items():\n    return os.environ.get('DB_URL')\n`);
  w(root, 'backend/models.py', `from sqlalchemy.orm import DeclarativeBase\nclass Base(DeclarativeBase):\n    pass\nclass Item(Base):\n    pass\n`);
  w(root, 'supabase/config.toml', `project_id = "x"\n\n[functions.stripe-webhook]\nverify_jwt = false\n`);
  w(root, 'supabase/functions/send-email/index.ts', `const key = Deno.env.get('RESEND_API_KEY');\nDeno.serve(async (req) => { if (req.method === 'POST') { await supabase.from('emails').insert({}); } return fetch('https://api.resend.com/x'); });`);
  w(root, 'supabase/functions/stripe-webhook/index.ts', `Deno.serve(async (req) => { await supabase.from('payments').insert({}); return new Response('ok'); });`);
  w(root, 'supabase/functions/orphan-fn/index.ts', `Deno.serve(() => new Response('x'));`);
  w(root, 'supabase/migrations/001_init.sql', `create table public.contacts (id uuid primary key default gen_random_uuid(), name text not null, email text, "createdAt" timestamptz default now(), lat double precision, created2 timestamp with time zone);
alter table public.contacts enable row level security;
create policy "contacts_select" on public.contacts for select to authenticated using (true);
create index contacts_email_idx on public.contacts (email);
create table public.legacy (id int);
create table public.emails (id uuid primary key, contact_id uuid references public.contacts(id));
create or replace function public.is_admin(uid uuid) returns boolean language sql as $$ select true; $$;
create type public.app_role as enum ('admin', 'agent');
insert into storage.buckets (id, name) values ('avatars', 'avatars');
select cron.schedule('nightly', '0 3 * * *', $$ select net.http_post('https://x.supabase.co/functions/v1/send-email') $$);`);
  w(root, 'supabase/migrations/002_evolve.sql', `alter table public.contacts add column phone text, drop column email;
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select to authenticated using (auth.uid() = id);
create policy "contacts_insert" on public.contacts for insert to authenticated with check (true);
drop table public.legacy;
create table public.payments (id uuid primary key, amount numeric);
create trigger trg_pay after insert on public.payments for each row execute function public.is_admin();
alter table public.contacts alter column phone set not null, alter column phone set default 'n/a';
do $$ begin
  drop policy if exists "contacts_insert" on public.contacts;
  create policy "contacts_insert" on public.contacts for insert to service_role with check (true);
  execute format('create policy %I on public.payments for select using (true)', 'dyn');
end $$;`);
  w(root, 'src/integrations/supabase/types.ts', `export type Database = {\n  public: {\n    Tables: {\n      contacts: {\n        Row: {\n          id: string\n          name: string\n          phone: string | null\n          extra_col: string\n        }\n        Insert: { id?: string }\n      }\n    }\n  }\n}`);
  w(root, 'scripts/audit.mjs', `// Audita o banco.\nconsole.log(process.env.DB_URL);`);
  w(root, 'scripts/orphan.sh', `#!/bin/sh\necho x`);
  w(root, '.github/workflows/ci.yml', `name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run test\n      - run: node scripts/audit.mjs\n        env:\n          T: \${{ secrets.DB_TOKEN }}\n`);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'feat: fixture'], { cwd: root });
  return root;
}

const root = fixture();
const out = path.join(root, 'inventario/ia');
execFileSync(process.execPath, [GERADOR, '--quiet'], { cwd: root });
const J = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));

test('gera todos os arquivos e sem erros de seção', () => {
  for (const f of ['INDEX.md', 'manifest.json', 'rotas.json', 'modulos.json', 'componentes.json', 'hooks.json', 'edge-functions.json', 'banco.json', 'ferramentas.json', 'scripts.json', 'testes.json', 'logica.json', 'grafo.json', 'grafo-arestas.json', 'convencoes.json', 'baseline.json', 'grafo-graphify.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.deepEqual(J('manifest.json').erros, []);
  assert.equal(J('manifest.json').commit.length, 40);
});

test('rotas: aninhamento, index, lazy, proteção herdada e fecho transitivo', () => {
  const r = J('rotas.json'); const by = Object.fromEntries(r.urls.filter((u) => !u.indice).map((u) => [u.caminho, u]));
  assert.equal(by['/login'].arquivo, 'src/pages/Login.tsx');
  assert.equal(by['/app'].arquivo, 'src/components/layout/Shell.tsx');
  assert.equal(by['/app'].protegida, true);
  assert.equal(by['/app/contacts/:id'].arquivo, 'src/components/contacts/ContactPage.tsx');
  assert.equal(by['/app/contacts/:id'].pai, '/app');
  assert.equal(by['/app/contacts/:id'].protegida, true, 'filha herda proteção do pai');
  assert.ok(r.urls.some((u) => u.indice && u.caminho === '/app' && u.arquivo === 'src/components/home/Home.tsx'), 'rota index');
  assert.equal(by['/admin'].lazy, true);
  assert.equal(by['/admin'].arquivo, 'src/pages/admin/Admin.tsx');
  assert.deepEqual(by['/app/contacts/:id'].tabelas, ['contacts']);
  assert.deepEqual(by['/app/contacts/:id'].edges, ['send-email']);
  assert.deepEqual(by['/app/contacts/:id'].hooks_locais, ['useContacts']);
  assert.deepEqual(by['/admin'].papeis, ['admin']);
  assert.equal(by['/access-denied'].arquivo, 'src/pages/Login.tsx', 'path via spread');
  assert.equal(by['/old'].tipo, 'redirect'); assert.equal(by['/old'].redireciona, '/app');
  const vistas = Object.fromEntries(r.vistas.map((v) => [v.id, v]));
  assert.equal(vistas.home.arquivo, 'src/components/home/Home.tsx');
  assert.equal(vistas.achievements.arquivo, 'src/components/achievements/Achievements.tsx', 'SPECIAL_VIEWS com função');
});

test('rotas HTTP de backend (express) e Python (FastAPI)', () => {
  const r = J('rotas.json');
  assert.ok(r.rotas_http_backend.some((x) => x.metodo === 'GET' && x.caminho === '/health' && x.arquivo === 'server/api.ts'));
  assert.ok(r.rotas_http_backend.some((x) => x.metodo === 'GET' && x.caminho === '/items' && x.arquivo === 'backend/app.py'));
});

test('menu: resolve destino, grupo, papéis e aponta item sem destino', () => {
  const r = J('rotas.json'); const m = Object.fromEntries(r.menu.map((x) => [x.rotulo, x]));
  assert.equal(m['Início'].resolve_para, 'src/components/layout/Shell.tsx');
  assert.equal(m['Início'].grupo, 'Principal');
  assert.deepEqual(m['Contatos'].papeis, ['admin']);
  assert.deepEqual(J('baseline.json').alertas.menu_sem_destino, ['Fantasma -> /nada']);
  assert.deepEqual(m['Equipe'].papeis, ['admin', 'supervisor'], 'roles por constante');
  assert.equal(m['Externo'].papeis_nao_resolvidos, 'EXTERNAL');
});

test('módulos: menu → módulo → hooks → edges → tabelas', () => {
  const mod = J('modulos.json').modulos.find((x) => x.modulo === 'components/contacts');
  assert.deepEqual(mod.itens_menu, ['Contatos']);
  assert.deepEqual(mod.hooks_locais, ['useContacts']);
  assert.deepEqual(mod.edges, ['send-email']);
  assert.deepEqual(mod.tabelas, ['contacts']);
  assert.ok(mod.depende_de_modulos.includes('hooks/useContacts.ts') || mod.depende_de_modulos.includes('hooks'));
  assert.ok(mod.depende_de_modulos.includes('components/ui'));
});

test('barrel re-export não gera órfão; componente sem uso é órfão', () => {
  const co = J('componentes.json'); const by = Object.fromEntries(co.componentes.map((x) => [x.arquivo, x]));
  assert.equal(by['src/components/ui/Card.tsx'].orfao, false, 'reexportado pelo index.ts');
  assert.equal(by['src/components/ui/Button.tsx'].orfao, false, 'export * from');
  assert.equal(by['src/components/ui/Unused.tsx'].orfao, true);
  assert.ok(J('componentes.json').componentes.some((x) => x.arquivo === 'src/pages/Login.tsx' && x.export_default === 'Login'));
});

test('hooks: tabelas/edges e cobertura por teste', () => {
  const h = J('hooks.json').hooks.find((x) => x.arquivo === 'src/hooks/useContacts.ts');
  assert.deepEqual(h.hooks_exportados, ['useContacts']);
  assert.deepEqual(h.tabelas, ['contacts']);
  assert.equal(h.usado_por, 2);
  assert.equal(h.coberto_por_testes, 1);
  assert.equal(J('testes.json').arquivos[0].casos, 2);
});

test('edge functions: verify_jwt, env, quem chama, cron e órfãs', () => {
  const e = J('edge-functions.json'); const by = Object.fromEntries(e.edges.map((x) => [x.nome, x]));
  assert.equal(by['send-email'].verify_jwt, true);
  assert.deepEqual(by['send-email'].env, ['RESEND_API_KEY']);
  assert.deepEqual(by['send-email'].metodos, ['POST']);
  assert.deepEqual(by['send-email'].chamada_pelo_front, ['src/hooks/useContacts.ts']);
  assert.equal(by['send-email'].chamada_por_sql_ou_cron, true);
  assert.deepEqual(by['send-email'].hosts_externos, ['api.resend.com']);
  assert.equal(by['stripe-webhook'].verify_jwt, false);
  assert.equal(by['stripe-webhook'].orfa, false, 'webhook sem jwt não é órfã');
  assert.equal(by['orphan-fn'].orfa, true);
});

test('banco: migrations em ordem (add/drop coluna, drop+create policy, drop table), cron, buckets, drift', () => {
  const b = J('banco.json'); const t = b.tabelas.contacts;
  assert.deepEqual(Object.keys(t.colunas), ['created2', 'createdAt', 'id', 'lat', 'name', 'phone'], 'email removida, phone adicionada');
  assert.equal(t.colunas.lat.tipo, 'double precision');
  assert.equal(t.colunas.created2.tipo, 'timestamp with time zone');
  assert.equal(t.colunas.phone.nn, true, 'SET NOT NULL aplicado');
  assert.equal(t.colunas.phone.default, "'n/a'");
  assert.equal(t.policies.find((p) => p.nome === 'contacts_insert').para, 'service_role', 'policy recriada dentro de DO $$');
  assert.equal(b.avisos.length, 1, 'DDL dinâmico sinalizado');
  assert.equal(t.colunas.name.nn, true);
  assert.equal(t.rls, true);
  assert.deepEqual(t.policies.map((p) => p.nome + ':' + p.comando), ['contacts_insert:insert', 'contacts_select:select']);
  assert.deepEqual(t.indices.map((i) => i.nome), ['contacts_email_idx']);
  assert.equal(b.tabelas.legacy, undefined, 'drop table');
  assert.deepEqual(b.tabelas.emails.fks, ['contact_id->contacts']);
  assert.deepEqual(b.tabelas.payments.triggers, ['trg_pay']);
  assert.equal(b.tabelas.payments.sem_rls, true);
  assert.deepEqual(b.funcoes, ['is_admin']);
  assert.deepEqual(b.enums.app_role, ['admin', 'agent']);
  assert.deepEqual(b.cron_jobs, [{ nome: 'nightly', agenda: '0 3 * * *', migration: '001_init.sql', chama_edge: 'send-email' }]);
  assert.ok(b.buckets.some((x) => x.nome === 'avatars' && x.criado_em_sql));
  assert.deepEqual(t.drift, { so_na_migration: ['createdAt', 'lat', 'created2'], so_no_types: ['extra_col'] });
  assert.deepEqual(b.rpcs_usadas_no_codigo, [{ nome: 'is_admin', definida: true, usada_em: 1 }]);
});

test('ferramentas: env, workflows, scripts, integrações, permissões, flags, providers', () => {
  const f = J('ferramentas.json');
  assert.deepEqual(f.env.usadas_mas_nao_declaradas, ['VITE_ANON']);
  assert.equal(f.workflows[0].nome, 'CI');
  assert.deepEqual(f.workflows[0].gatilhos, ['pull_request', 'push']);
  assert.deepEqual(f.workflows[0].secrets, ['DB_TOKEN']);
  assert.deepEqual(f.workflows[0].scripts_usados, ['scripts/audit.mjs']);
  const s = Object.fromEntries(J('scripts.json').scripts.map((x) => [x.arquivo, x]));
  assert.deepEqual(s['scripts/audit.mjs'].npm_scripts, ['audit']);
  assert.equal(s['scripts/audit.mjs'].orfao, false);
  assert.equal(s['scripts/orphan.sh'].orfao, true);
  assert.ok(f.integracoes.sdks.some((x) => x.servico === 'Stripe'));
  assert.ok(f.integracoes.webhooks_recebidos.includes('stripe-webhook'));
  assert.ok(f.integracoes.webhooks_recebidos.includes('POST /webhook/stripe'));
  assert.deepEqual(f.permissoes.papeis_no_codigo, [{ papel: 'admin', ocorrencias: 2 }]);
  assert.deepEqual(f.feature_flags.flags, [{ flag: 'novo-inbox', arquivos: 1 }]);
  assert.ok(f.providers.providers.includes('QueryClientProvider'));
  assert.equal(f.stack.framework, 'React');
  assert.deepEqual(f.stack.backend_http, ['express', 'fastapi']);
});

test('grafo, convenções e determinismo', () => {
  const g = J('grafo.json');
  assert.ok(g.hubs[0].arquivo === 'src/lib/supabase.ts' || g.hubs[0].arquivo === 'src/hooks/useContacts.ts');
  assert.equal(g.ciclos.total, 0);
  const c = J('convencoes.json');
  assert.equal(c.alias_imports['(raiz)']['@/'], 'src/');
  assert.equal(c.typescript.strict, true);
  assert.match(c.nomenclatura.componentes, /^PascalCase/);
  const antes = fs.readFileSync(path.join(out, 'rotas.json'), 'utf8');
  execFileSync(process.execPath, [GERADOR, '--quiet'], { cwd: root });
  assert.equal(fs.readFileSync(path.join(out, 'rotas.json'), 'utf8'), antes, 'saída determinística');
  const l = J('logica.json'); assert.ok(l.arquivos.some((x) => x.arquivo === 'backend/models.py' && x.exports.includes('Item')));
});
