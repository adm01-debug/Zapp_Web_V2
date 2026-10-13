import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./lint-migrations-content.mjs', import.meta.url));

const V = '20261012000001';

// Roda o lint REAL (spawn do .mjs) contra um diretorio de fixtures. O manifesto
// de excecoes e escrito em separado para nao depender do arquivo do repositorio.
function runLint({ files, changed = null, exceptions = [] }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-migrations-content-'));
  const migrationsDir = path.join(tmp, 'migrations');
  const manifestPath = path.join(tmp, 'migration-evidence.json');
  fs.mkdirSync(migrationsDir);

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(migrationsDir, name), content);
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ schema_version: 2, exceptions }));

  const env = {
    ...process.env,
    MIGRATIONS_DIR: migrationsDir,
    MIGRATION_LINT_MANIFEST: manifestPath,
  };
  if (changed) {
    // CHANGED_FILES recebe caminhos absolutos, como o `git diff` do CI entrega.
    env.CHANGED_FILES = changed.map((name) => path.join(migrationsDir, name)).join('\n');
  } else {
    delete env.CHANGED_FILES;
  }

  const result = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

// ── ML-001: SECURITY DEFINER sem SET search_path ─────────────────────────────
test('ML-001 barra SECURITY DEFINER sem search_path e libera com search_path', () => {
  const semSearchPath = `
CREATE FUNCTION public.f_alvo() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$ BEGIN PERFORM 1; END $$;
`;
  const red = runLint({ files: { [`${V}_ml001_red.sql`]: semSearchPath } });
  assert.equal(red.status, 1, red.output);
  assert.match(red.output, /\[ML-001\]/);

  const comSearchPath = `
CREATE FUNCTION public.f_alvo() RETURNS void
LANGUAGE plpgsql SET search_path = public SECURITY DEFINER
AS $$ BEGIN PERFORM 1; END $$;
`;
  const green = runLint({ files: { [`${V}_ml001_green.sql`]: comSearchPath } });
  assert.equal(green.status, 0, green.output);
});

// ── ML-004: CREATE TABLE de app sem ENABLE ROW LEVEL SECURITY ────────────────
test('ML-004 barra CREATE TABLE public sem RLS e libera com RLS/isenção', () => {
  const semRls = 'CREATE TABLE public.tabela_nova (id integer PRIMARY KEY);\n';
  const red = runLint({ files: { [`${V}_ml004_red.sql`]: semRls } });
  assert.equal(red.status, 1, red.output);
  assert.match(red.output, /\[ML-004\]/);

  const comRls = 'CREATE TABLE public.tabela_nova (id integer PRIMARY KEY);\n'
    + 'ALTER TABLE public.tabela_nova ENABLE ROW LEVEL SECURITY;\n';
  const green = runLint({ files: { [`${V}_ml004_green.sql`]: comRls } });
  assert.equal(green.status, 0, green.output);

  const isento = '-- tabela ja existente com RLS habilitada na migration anterior\n'
    + 'CREATE TABLE IF NOT EXISTS public.tabela_nova (id integer PRIMARY KEY); -- ignore-lint-ml004\n';
  const greenIsento = runLint({ files: { [`${V}_ml004_isento.sql`]: isento } });
  assert.equal(greenIsento.status, 0, greenIsento.output);
});

// ── ML-005: GRANT EXECUTE a PUBLIC/anon ─────────────────────────────────────
test('ML-005 barra GRANT EXECUTE a anon/PUBLIC, inclusive multilinha', () => {
  const linhaUnica = 'GRANT EXECUTE ON FUNCTION public.f_alvo() TO anon;\n';
  const red = runLint({ files: { [`${V}_ml005_red.sql`]: linhaUnica } });
  assert.equal(red.status, 1, red.output);
  assert.match(red.output, /\[ML-005\]/);

  const multilinha = 'GRANT EXECUTE\n  ON FUNCTION public.f_alvo()\n  TO PUBLIC;\n';
  const redMulti = runLint({ files: { [`${V}_ml005_multi.sql`]: multilinha } });
  assert.equal(redMulti.status, 1, redMulti.output);
  assert.match(redMulti.output, /\[ML-005\]/);

  const authenticated = 'GRANT EXECUTE ON FUNCTION public.f_alvo() TO authenticated;\n';
  const green = runLint({ files: { [`${V}_ml005_green.sql`]: authenticated } });
  assert.equal(green.status, 0, green.output);

  const stub = '-- stub de CI, liberado de proposito -- ignore-lint-ml005\n'
    + 'GRANT EXECUTE ON FUNCTION public.f_stub() TO anon;\n';
  const greenStub = runLint({ files: { [`${V}_ml005_stub.sql`]: stub } });
  assert.equal(greenStub.status, 0, greenStub.output);
});

// ── ML-008: SECDEF + GRANT a authenticated sem checagem do dono ─────────────
test('ML-008 barra SECDEF sem auth.uid()/has_role() e libera com a guarda', () => {
  const semGuarda = 'CREATE FUNCTION public.f_alvo() RETURNS void\n'
    + 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public\n'
    + 'AS $$ BEGIN UPDATE public.t SET x = 1; END $$;\n'
    + 'GRANT EXECUTE ON FUNCTION public.f_alvo() TO authenticated;\n';
  const red = runLint({ files: { [`${V}_ml008_red.sql`]: semGuarda } });
  assert.equal(red.status, 1, red.output);
  assert.match(red.output, /\[ML-008\]/);

  const comAuthUid = semGuarda.replace(
    'AS $$ BEGIN UPDATE public.t SET x = 1; END $$;',
    "AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF; UPDATE public.t SET x = 1; END $$;",
  );
  const greenUid = runLint({ files: { [`${V}_ml008_uid.sql`]: comAuthUid } });
  assert.equal(greenUid.status, 0, greenUid.output);

  const comHasRole = semGuarda.replace(
    'AS $$ BEGIN UPDATE public.t SET x = 1; END $$;',
    "AS $$ BEGIN IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF; UPDATE public.t SET x = 1; END $$;",
  );
  const greenRole = runLint({ files: { [`${V}_ml008_role.sql`]: comHasRole } });
  assert.equal(greenRole.status, 0, greenRole.output);

  const isento = semGuarda.replace(
    'GRANT EXECUTE ON FUNCTION public.f_alvo() TO authenticated;',
    'GRANT EXECUTE ON FUNCTION public.f_alvo() TO authenticated; -- ignore-lint-ml008',
  );
  const greenIsento = runLint({ files: { [`${V}_ml008_isento.sql`]: isento } });
  assert.equal(greenIsento.status, 0, greenIsento.output);
});

test('ML-008 aceita as guardas canonicas da V2 (auth.role, current_profile_id)', () => {
  const base = [
    'CREATE OR REPLACE FUNCTION public.f_alvo()',
    'RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public',
    'AS $$ BEGIN PERFORM 1; END; $$;',
    'GRANT EXECUTE ON FUNCTION public.f_alvo() TO authenticated;',
    '',
  ].join('\n');

  const comRole = runLint({
    files: { [`${V}_ml008_role.sql`]: base.replace('PERFORM 1;', "IF auth.role() = 'anon' THEN RAISE EXCEPTION 'no'; END IF;") },
  });
  assert.equal(comRole.status, 0, comRole.output);

  const comProfileId = runLint({
    files: { [`${V}_ml008_profile.sql`]: base.replace('PERFORM 1;', 'IF public.current_profile_id() IS NULL THEN RAISE EXCEPTION \'no\'; END IF;') },
  });
  assert.equal(comProfileId.status, 0, comProfileId.output);
});

test('texto em comentario/string nao vira violacao (justificativa do COMMENT ON)', () => {
  // A V2 cita "SECURITY DEFINER" na justificativa de `comment on function ... is
  // '...'` — falso positivo real no merge dia/2026-10-12 sem o mascaramento.
  const src = [
    '-- justificativa que cita SECURITY DEFINER e GRANT EXECUTE ON FUNCTION x TO anon',
    "COMMENT ON FUNCTION public.f_x() IS 'SECURITY DEFINER com SET search_path; GRANT EXECUTE ON FUNCTION x TO anon';",
    '',
  ].join('\n');
  const r = runLint({ files: { [`${V}_apenas_texto.sql`]: src } });
  assert.equal(r.status, 0, r.output);
});

// ── ANTIPADRAO: EXCEPTION WHEN OTHERS THEN ... RAISE NOTICE ─────────────────
test('ANTIPADRAO barra WHEN OTHERS que engole a falha e libera o re-raise', () => {
  const engole = 'DO $$ BEGIN\n'
    + '  PERFORM 1;\n'
    + 'EXCEPTION WHEN OTHERS THEN\n'
    + '  RAISE NOTICE \'falhou mas segue: %\', SQLERRM;\n'
    + 'END $$;\n';
  const red = runLint({ files: { [`${V}_antipadrao_red.sql`]: engole } });
  assert.equal(red.status, 1, red.output);
  assert.match(red.output, /\[ANTIPADRAO\]/);

  const reRaise = engole.replace(
    "  RAISE NOTICE 'falhou mas segue: %', SQLERRM;\n",
    "  RAISE NOTICE 'falhou: %', SQLERRM;\n  RAISE;\n",
  );
  const green = runLint({ files: { [`${V}_antipadrao_green.sql`]: reRaise } });
  assert.equal(green.status, 0, green.output);
});

// ── CHANGED_FILES: so os arquivos alterados no PR ────────────────────────────
test('CHANGED_FILES lint apenas o que o PR altera', () => {
  const antigaVioladora = 'GRANT EXECUTE ON FUNCTION public.f_velha() TO anon;\n';
  const novaOk = 'CREATE TABLE public.tabela_nova (id integer PRIMARY KEY);\n'
    + 'ALTER TABLE public.tabela_nova ENABLE ROW LEVEL SECURITY;\n';
  const files = {
    [`${V}_divida_historica.sql`]: antigaVioladora,
    ['20261012000002_nova.sql']: novaOk,
  };

  // Sem CHANGED_FILES, a divida historica reprova (varredura completa).
  const completo = runLint({ files });
  assert.equal(completo.status, 1, completo.output);

  // Com CHANGED_FILES apontando so a migration nova, passa.
  const apenasNova = runLint({
    files,
    changed: ['20261012000002_nova.sql'],
  });
  assert.equal(apenasNova.status, 0, apenasNova.output);

  // E a migration nova, se for violadora, e barrada mesmo com a divida fora.
  const novaVioladora = runLint({
    files: { ...files, ['20261012000003_outra.sql']: 'CREATE TABLE public.sem_rls (id integer);\n' },
    changed: ['20261012000003_outra.sql'],
  });
  assert.equal(novaVioladora.status, 1, novaVioladora.output);
  assert.match(novaVioladora.output, /\[ML-004\]/);
  assert.doesNotMatch(novaVioladora.output, /divida_historica/);
});

// ── Excecoes documentadas no manifesto ──────────────────────────────────────
test('arquivo listado no manifesto de excecoes e dispensado', () => {
  const violadora = 'GRANT EXECUTE ON FUNCTION public.f_alvo() TO anon;\n';
  const nome = `${V}_excecao.sql`;
  const comExcecao = runLint({
    files: { [nome]: violadora },
    exceptions: [{ version: V, filename: nome, kind: 'ledger-divergence/pinned-replay' }],
  });
  assert.equal(comExcecao.status, 0, comExcecao.output);
  assert.match(comExcecao.output, /EXCECAO-MANIFESTO/);

  // Sem a entrada no manifesto, o mesmo arquivo e barrado (fail-closed).
  const semExcecao = runLint({ files: { [nome]: violadora } });
  assert.equal(semExcecao.status, 1, semExcecao.output);
});

// ── Caso limpo ──────────────────────────────────────────────────────────────
test('migration limpa passa com mensagem de sucesso', () => {
  const limpa = '-- Rollback: DROP TABLE public.tabela_nova;\n'
    + 'CREATE TABLE public.tabela_nova (id integer PRIMARY KEY);\n'
    + 'ALTER TABLE public.tabela_nova ENABLE ROW LEVEL SECURITY;\n';
  const result = runLint({ files: { [`${V}_limpa.sql`]: limpa } });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /0 violacoes/);
});
