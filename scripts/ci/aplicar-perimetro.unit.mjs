import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planejar } from './aplicar-perimetro.mjs';

// GA80: perimetro so por script versionado (dry-run por padrao).
// O script roda de VERDADE (child process) com fetch stubbed.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'aplicar-perimetro.mjs');
const BASE = JSON.parse(
  (await import('node:fs')).readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'github-settings-baseline.json'), 'utf8'),
);

function stub(vivo) {
  return [
    'globalThis.fetch = async (url, opts) => {',
    '  const p = String(url).replace("https://api.github.com", "");',
    '  const method = String((opts && opts.method) || "GET").toUpperCase();',
    `  const VIVO = ${JSON.stringify(vivo)};`,
    '  const send = (obj, status) => ({ ok: (status ?? 200) >= 200 && (status ?? 200) < 300, status: status ?? 200, text: async () => JSON.stringify(obj), json: async () => obj });',
    '  if (method === "GET" && p.endsWith("/branches/main/protection")) return send(VIVO.protection);',
    '  if (method === "GET" && p === "/repos/o/r") return send(VIVO.repo);',
    '  if (method === "GET" && p.endsWith("/actions/permissions/selected-actions")) return send({ patterns_allowed: VIVO.patterns });',
    '  return send({});',
    '};',
    '',
  ].join('\n');
}

function vivoIgualAoBaseline() {
  return {
    protection: {
      required_status_checks: { strict: BASE.branch_protection_main.strict, contexts: BASE.branch_protection_main.required_status_checks },
      enforce_admins: { enabled: BASE.branch_protection_main.enforce_admins },
    },
    repo: Object.fromEntries(Object.entries(BASE.merge).map(([k, v]) => [k, v])),
    patterns: BASE.selected_actions_patterns,
  };
}

function rodar(args, vivo) {
  const arquivo = 'data:text/javascript,' + encodeURIComponent(stub(vivo));
  const res = spawnSync(process.execPath, ['--import', arquivo, SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r' },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('aplicar-perimetro (GA80)', () => {
  it('planejar: vivo igual ao baseline = zero PATCHes', async () => {
    const vivo = vivoIgualAoBaseline();
    const ler = async (path) =>
      path.endsWith('/protection') ? vivo.protection
      : path.endsWith('/selected-actions') ? { patterns_allowed: vivo.patterns }
      : vivo.repo;
    assert.deepEqual(await planejar(ler), []);
  });

  it('planejar: strict=false no vivo vira 1 PATCH (sem aplicar)', async () => {
    const vivo = vivoIgualAoBaseline();
    vivo.protection.required_status_checks.strict = false;
    const ler = async (path) =>
      path.endsWith('/protection') ? vivo.protection
      : path.endsWith('/selected-actions') ? { patterns_allowed: vivo.patterns }
      : vivo.repo;
    const planos = await planejar(ler);
    assert.equal(planos.length, 1);
    assert.ok(planos[0].path.endsWith('required_status_checks'));
    assert.equal(planos[0].corpo.strict, true);
  });

  it('dry-run (padrao): vivo igual = "sem diferenca", exit 0, nenhum PATCH', () => {
    const r = rodar([], vivoIgualAoBaseline());
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('sem diferenca'), r.out);
  });

  it('dry-run: vivo divergente lista PATCHes e NAO aplica', () => {
    const vivo = vivoIgualAoBaseline();
    vivo.protection.required_status_checks.strict = false;
    const r = rodar([], vivo);
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('PATCH'), r.out);
    assert.ok(r.out.includes('nada aplicado'), r.out);
  });

  it('--apply sem --confirm recusa (protecao contra apply acidental)', () => {
    const r = rodar(['--apply'], vivoIgualAoBaseline());
    assert.equal(r.code, 1, r.out);
    assert.ok(r.out.includes('--confirm=APLICAR-PERIMETRO'), r.out);
  });

  it('--apply com confirm e vivo igual nao chama PATCH', () => {
    const r = rodar(['--apply', '--confirm=APLICAR-PERIMETRO'], vivoIgualAoBaseline());
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('sem diferenca'), r.out);
  });
});

  it('planejar: selected-actions divergentes viram 1 PUT', async () => {
    const ler = async (path) => {
      if (path.endsWith('/protection')) return vivoIgualAoBaseline().protection;
      if (path.endsWith('/selected-actions')) return { patterns_allowed: ['actions/checkout'] };
      return vivoIgualAoBaseline().repo;
    };
    const planos = await planejar(ler);
    assert.equal(planos.length, 1);
    assert.equal(planos[0].metodo, 'PUT');
    assert.ok(planos[0].path.endsWith('/selected-actions'));
  });
