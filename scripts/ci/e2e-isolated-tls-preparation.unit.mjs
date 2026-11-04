import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertBlocking, jobOf, onlyStep, runOf, stepsOf, valueOf } from './workflow-test-support.mjs';

const yaml = readFileSync(new URL('../../.github/workflows/e2e-logado-isolado.yml', import.meta.url), 'utf8');
const steps = stepsOf(jobOf(yaml, 'bootstrap-login'));
const bootstrap = onlyStep(steps, step => valueOf(step, 'id') === 'bootstrap', 'bootstrap');
const temp = mkdtempSync(join(tmpdir(), 'e2e-tls-preparation-'));
after(() => rmSync(temp, { recursive: true, force: true }));
// A fronteira do sudo/apt é simulada: o corpo Bash é o publicado no workflow,
// mas o teste nunca instala pacotes, acessa a rede ou muda certificados do host.
writeFileSync(join(temp, 'sudo'), `#!/bin/bash
printf '%s\n' "$*" >> "$RECORDED"
case "$*" in
  'apt-get update') exit "$UPDATE_STATUS" ;;
  'apt-get install --no-install-recommends -y openssl libnss3-tools') exit "$INSTALL_STATUS" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });

function tlsStep() {
  return onlyStep(steps, step => /libnss3-tools/.test(runOf(step)), 'OpenSSL e certutil antes do controller');
}

test('login instala ferramentas TLS antes do controller e não altera truststore do host', () => {
  const tls = tlsStep();
  assert.ok(steps.indexOf(tls) < steps.indexOf(bootstrap));
  assertBlocking(tls);
  assertBlocking(bootstrap);
  assert.doesNotMatch(runOf(tls), /update-ca-certificates|certutil\s|NODE_TLS_REJECT_UNAUTHORIZED|curl/);
});

for (const [update, install] of [[0, 0], [1, 0], [137, 0], [0, 1], [0, 137]]) {
  test(`preparo TLS real propaga update=${update}, install=${install}`, () => {
    const recorded = join(temp, `commands-${update}-${install}`);
    const result = spawnSync('bash', ['-s'], {
      input: runOf(tlsStep()), cwd: temp, encoding: 'utf8', timeout: 10000,
      env: { PATH: temp + ':' + process.env.PATH, RECORDED: recorded, UPDATE_STATUS: String(update), INSTALL_STATUS: String(install) },
    });
    assert.equal(result.status, update || install, result.stderr);
    const commands = readFileSync(recorded, 'utf8').trim().split('\n');
    assert.deepEqual(commands, update ? ['apt-get update'] : [
      'apt-get update', 'apt-get install --no-install-recommends -y openssl libnss3-tools',
    ]);
  });
}
