import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./check-screen-permission-db-guards.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

// Front de mentira: cada regra do extrator aparece UMA vez, e as duas armadilhas
// (permissao que so existe em teste da tela; `permission:` que nao e permissao
// nomeada) aparecem de proposito para provar que NAO entram na tabela.
const FRONT = {
  'components/auth/Gate.tsx': [
    'export function Gate() {',
    '  return (',
    '    <ProtectedRoute requiredPermission="view_reports"><X /></ProtectedRoute>',
    '  );',
    '}',
    "export const ComRelatorio = withPermission(Relatorio, 'export_reports');",
  ].join('\n'),
  'hooks/system/usePermissions.ts': [
    "const modo = hasAllPermissions(['view_inbox', 'manage_roles']);",
    "const rpc = supabase.rpc('user_has_permission', {",
    '  _user_id: id,',
    "  _permission_name: 'view_contacts',",
    '});',
  ].join('\n'),
  'services/navigation.service.ts': [
    "const MULTIPLIX_DISPATCH_CREATE = 'multiplix.dispatch.create';",
    "export const itens = [{ id: 'multiplix', permission: MULTIPLIX_DISPATCH_CREATE }];",
  ].join('\n'),
  'components/notifications/usePushNotifications.ts': [
    "{ permission: 'default' }", // NotificationPermission: nao e permissao nomeada
  ].join('\n'),
  'hooks/__tests__/usePermissions.test.tsx': [
    "expect(result.current.hasPermission('permissao_de_teste')).toBe(true);",
  ].join('\n'),
};

const MIGRATIONS = {
  '20260101000000_trava_send_messages.sql': [
    '-- comentario cita user_has_permission() e NAO pode virar trava',
    'DO $$ BEGIN',
    "  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN",
    "    RAISE EXCEPTION 'send_messages_permission_required';",
    '  END IF;',
    'END $$;',
  ].join('\n'),
  '20260102000000_trava_manage_roles.sql': [
    'CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id UUID, _permission_name TEXT)',
    'RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT true $$;',
    "ALTER POLICY p ON public.permissions USING (public.user_has_permission(auth.uid(), 'manage_roles'));",
  ].join('\n'),
};

function escrever(raiz, arquivos) {
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const completo = path.join(raiz, relativo);
    fs.mkdirSync(path.dirname(completo), { recursive: true });
    fs.writeFileSync(completo, conteudo + '\n');
  }
}

function fixture(front = FRONT, migrations = MIGRATIONS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'permission-guards-test-'));
  const frontDir = path.join(tmp, 'src');
  const migrationsDir = path.join(tmp, 'supabase', 'migrations');
  escrever(frontDir, front);
  escrever(migrationsDir, migrations);
  return { tmp, frontDir, migrationsDir };
}

function executar(frontDir, migrationsDir, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, frontDir, migrationsDir, ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function linhaDe(saida, permissao) {
  return saida.split('\n').find((linha) => linha.startsWith('| ' + permissao + ' |')) || '';
}

test('cruza a permissao da tela com a trava no banco e marca TRAVADA / SEM TRAVA', () => {
  const { tmp, frontDir, migrationsDir } = fixture();
  const r = executar(frontDir, migrationsDir);
  assert.equal(r.status, 0, r.stderr);
  const tela = r.stdout.split('\n');
  // cada regra de leitura do front chega na tabela
  assert.match(linhaDe(r.stdout, 'view_reports'), /Gate\.tsx:3/);
  assert.match(linhaDe(r.stdout, 'export_reports'), /Gate\.tsx:6/);
  assert.match(linhaDe(r.stdout, 'view_inbox'), /usePermissions\.ts:1/);
  assert.match(linhaDe(r.stdout, 'view_contacts'), /usePermissions\.ts:4/);
  assert.match(linhaDe(r.stdout, 'multiplix.dispatch.create'), /navigation\.service\.ts:2/);
  // e o estado de cada uma
  assert.match(linhaDe(r.stdout, 'view_reports'), /SEM TRAVA/);
  assert.match(linhaDe(r.stdout, 'multiplix.dispatch.create'), /SEM TRAVA/);
  assert.match(linhaDe(r.stdout, 'manage_roles'), /TRAVADA/);
  assert.match(linhaDe(r.stdout, 'manage_roles'), /20260102000000_trava_manage_roles\.sql:3/);
  // a definicao de user_has_permission (sem nome) e a linha de comentario nao viram trava
  assert.doesNotMatch(tela.join('\n'), /\|\s*(UUID|TEXT)\s*\|/);
});

test('nao conta permissao que so aparece em teste da tela nem permission: que nao e nomeada', () => {
  const { tmp, frontDir, migrationsDir } = fixture();
  const r = executar(frontDir, migrationsDir);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /permissao_de_teste/);
  assert.equal(linhaDe(r.stdout, 'default'), '');
  // mas nao fica em silencio: o que foi ignorado aparece declarado no fim
  assert.match(r.stdout, /Nao contabilizado .*default \(components\/notifications\/usePushNotifications\.ts:1\)/);
});

test('resume a contagem e lista a trava do banco que a tela ainda nao usa', () => {
  const { tmp, frontDir, migrationsDir } = fixture();
  const r = executar(frontDir, migrationsDir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Resumo: 6 permissao\[oes\] usada\[s\] pela tela; 1 travada\[s\] no banco; 5 SEM TRAVA/);
  assert.match(
    r.stdout,
    /Com trava no banco e sem uso na tela: send_messages \(20260101000000_trava_send_messages\.sql:3\)/,
  );
});

test('--exigir-trava falha quando ha permissao da tela sem trava no banco', () => {
  const { tmp, frontDir, migrationsDir } = fixture();
  const r = executar(frontDir, migrationsDir, ['--exigir-trava']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SEM TRAVA/);
  assert.match(r.stderr, /FALHA: 5 permissao\[oes\] da tela sem trava no banco/);
});

test('--exigir-trava passa quando toda permissao da tela tem trava no banco', () => {
  const frontTravado = {
    'components/auth/Gate.tsx': '<ProtectedRoute requiredPermission="manage_roles"><X /></ProtectedRoute>',
  };
  const { tmp, frontDir, migrationsDir } = fixture(frontTravado, MIGRATIONS);
  const r = executar(frontDir, migrationsDir, ['--exigir-trava']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| manage_roles \|/);
  assert.match(r.stdout, /0 SEM TRAVA/);
});

test('entrada invalida: diretorio do front inexistente encerra com 2', () => {
  const { tmp, migrationsDir } = fixture();
  const r = executar(path.join(tmp, 'nao-existe'), migrationsDir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /diretorio inexistente/);
});

test('recusa caminho fora das raizes permitidas (fora do repositorio e do temporario)', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '/etc', '/etc'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fora das raizes permitidas/);
});
