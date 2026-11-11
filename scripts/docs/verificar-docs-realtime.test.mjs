import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verificador = new URL('./verificar-docs-realtime.mjs', import.meta.url);
const casos = [
  { sufixo: '', valido: true },
  { sufixo: ':1', valido: true },
  { sufixo: ':5', valido: true },
  { sufixo: ':6', valido: false },
  { sufixo: ':999', valido: false },
  { sufixo: ':0', valido: false },
  { sufixo: ':00', valido: false },
  { sufixo: ':00001', valido: true },
  { sufixo: ':1-5', valido: true },
  { sufixo: ':1-6', valido: false },
  { sufixo: ':4-999', valido: false },
  { sufixo: ':5-1', valido: false },
  { sufixo: ':1-0', valido: false },
  { sufixo: ':0-1', valido: false },
  { sufixo: ':5-5', valido: true },
  { sufixo: ':00004-00003', valido: false },
  { sufixo: ':999-999', valido: false },
  { sufixo: ':2-4', valido: true },
];

function executarCitacao(formato, sufixo) {
  const raiz = mkdtempSync(join(tmpdir(), 'docs-realtime-citacao-'));
  try {
    for (const dir of ['scripts/docs', 'scripts/db-audit', 'src', 'supabase/migrations', 'docs/adr']) {
      mkdirSync(join(raiz, dir), { recursive: true });
    }
    const script = join(raiz, 'scripts/docs/verificar-docs-realtime.mjs');
    copyFileSync(verificador, script);
    copyFileSync(new URL('./publication.mjs', import.meta.url), join(raiz, 'scripts/docs/publication.mjs'));
    copyFileSync(new URL('../db-audit/sql-lexer.mjs', import.meta.url), join(raiz, 'scripts/db-audit/sql-lexer.mjs'));
    writeFileSync(join(raiz, 'src/hook.ts'), [
      '// channel-one', "const tabela = 'hidden_table';", 'const a = 1;', 'const b = 2;', 'const c = 3;',
    ].join('\n'));
    writeFileSync(join(raiz, 'docs/REALTIME-CHANNELS-INVENTORY.md'),
      'Fora da publication hoje: `hidden_table`\n' +
      '| `channel-one` | `hidden_table` | `src/hook.ts:1` |\n');
    writeFileSync(join(raiz, 'docs/JORNADA_MENSAGEM_WHATSAPP.md'), 'Sem citações adicionais.\n');
    const caminho = formato === 'completa' ? 'src/hook.ts' : 'hook.ts';
    const atalho = formato === 'atalho' ? '`hook.ts` = `src/hook.ts`\n' : '';
    writeFileSync(join(raiz, 'docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md'),
      atalho + `Citação: \`${caminho}${sufixo}\`.\n`);
    return spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000 });
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

for (const formato of ['completa', 'curta', 'atalho']) {
  for (const { sufixo, valido } of casos) {
    test(`citação ${formato} ${sufixo || 'sem linha'} ${valido ? 'é aceita' : 'é recusada'}`, () => {
      const resultado = executarCitacao(formato, sufixo);
      assert.equal(resultado.error, undefined);
      assert.equal(resultado.signal, null);
      assert.equal(resultado.status, valido ? 0 : 1, resultado.stderr || resultado.stdout);
      if (valido) assert.match(resultado.stdout, /^OK: 3 documentos/);
      else {
        assert.match(resultado.stderr, /^FALHOU/);
        assert.match(resultado.stderr, /hook\.ts/);
      }
    });
  }
}

function executarLinhaMigration(linhaMigration, { migrationSql } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'docs-realtime-migration-'));
  try {
    for (const dir of ['scripts/docs', 'scripts/db-audit', 'src', 'supabase/migrations', 'docs/adr']) {
      mkdirSync(join(raiz, dir), { recursive: true });
    }
    const script = join(raiz, 'scripts/docs/verificar-docs-realtime.mjs');
    copyFileSync(verificador, script);
    copyFileSync(new URL('./publication.mjs', import.meta.url), join(raiz, 'scripts/docs/publication.mjs'));
    copyFileSync(new URL('../db-audit/sql-lexer.mjs', import.meta.url), join(raiz, 'scripts/db-audit/sql-lexer.mjs'));
    writeFileSync(join(raiz, 'src/hook.ts'), [
      '// channel-one', "const tabela = 'hidden_table';", 'const a = 1;', 'const b = 2;', 'const c = 3;',
    ].join('\n'));
    if (migrationSql) writeFileSync(join(raiz, 'supabase/migrations/20260101000000_x.sql'), migrationSql);
    writeFileSync(join(raiz, 'docs/REALTIME-CHANNELS-INVENTORY.md'),
      'Fora da publication hoje: `hidden_table`\n' +
      '| `channel-one` | `hidden_table` | `src/hook.ts:1` |\n\n' +
      '| Tabela | Migration (ADD) |\n' +
      '|---|---|\n' +
      `${linhaMigration}\n`);
    writeFileSync(join(raiz, 'docs/JORNADA_MENSAGEM_WHATSAPP.md'), 'Sem citações adicionais.\n');
    writeFileSync(join(raiz, 'docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md'), 'Sem citações adicionais.\n');
    return spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000 });
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test('linha tabela→migration sem crases no .sql da 2ª coluna é recusada (não pode passar em silêncio)', () => {
  const resultado = executarLinhaMigration('| `minha_tabela` | 20260101000000_x.sql |');
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.status, 1, resultado.stderr || resultado.stdout);
  assert.match(resultado.stderr, /^FALHOU/);
  assert.match(resultado.stderr, /minha_tabela/);
  assert.match(resultado.stderr, /sem nome de migration \.sql entre crases/);
});

test('linha tabela→migration com .sql entre crases continua sendo validada normalmente', () => {
  const resultado = executarLinhaMigration(
    '| `minha_tabela` | `20260101000000_x.sql` |',
    { migrationSql: 'ALTER PUBLICATION supabase_realtime ADD TABLE minha_tabela;\n' },
  );
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  assert.match(resultado.stdout, /^OK: 3 documentos/);
});
