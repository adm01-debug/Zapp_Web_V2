import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveImages, validReference } from '../e2e-isolated/resolve-images.mjs';

const DIGEST = 'a'.repeat(64);
function dockerFake({ context = 'unix:///var/run/docker.sock', digests, failAt } = {}) {
  const calls = [];
  const command = (executable, rawArgs, options) => {
    assert.deepEqual(rawArgs.slice(0, 2), ['--host', 'unix:///var/run/docker.sock']);
    const args = rawArgs.slice(2);
    calls.push({ executable, args, options });
    if (args[0] === failAt) return { status: 1, stdout: '', stderr: 'secret-must-not-be-forwarded' };
    if (args[0] === 'context') return { status: 0, stdout: JSON.stringify(context) };
    if (args[0] === 'pull') return { status: 0, stdout: 'downloaded' };
    if (args[0] === 'image') return { status: 0, stdout: JSON.stringify(digests ?? ['vendor/runtime@sha256:' + DIGEST]) };
    throw new Error('unexpected mutation: ' + args[0]);
  };
  return { command, calls };
}

for (const value of [
  'supabase/gotrue:v2.197.0', 'mcr.microsoft.com/playwright:v1.64.1-noble',
  'public.ecr.aws/supabase/postgrest:v14.5', 'vendor/runtime:v1@sha256:' + DIGEST,
]) test('imagem versionada aceita: ' + value, () => assert.equal(validReference(value), true));
for (const value of ['vendor/runtime:latest', 'vendor/runtime', 'vendor/runtime:v1;echo-secret', 'vendor/runtime:v1\nx', 'vendor/runtime:v1@sha256:abc', 'http://registry/runtime:v1', '', undefined]) {
  test('imagem não fixada/malformada rejeitada: ' + String(value), () => assert.equal(validReference(value), false));
}
test('resolver executa somente context/pull/inspect e exige revisão do digest', () => {
  const fake = dockerFake();
  const result = resolveImages({ images: { edge: 'vendor/runtime:v1' } }, fake.command);
  assert.deepEqual(result.pending_review, ['edge']);
  assert.equal(result.images.edge.proposed, 'vendor/runtime:v1@sha256:' + DIGEST);
  assert.equal(result.credentials_generated + result.sql_executed + result.containers_created + result.e2e_executed, 0);
  assert.deepEqual(fake.calls.map(call => call.args[0]), ['context', 'pull', 'image']);
  assert.ok(fake.calls.every(call => call.executable === 'docker'));
});
test('digest já pinado não é interpretado como execução de bootstrap', () => {
  const fake = dockerFake();
  const result = resolveImages({ images: { edge: 'vendor/runtime:v1@sha256:' + DIGEST } }, fake.command);
  assert.deepEqual(result.pending_review, []);
  assert.equal(result.images.edge.pulled_in_this_step, false);
  assert.deepEqual(fake.calls.map(call => call.args[0]), ['context']);
});
for (const context of ['tcp://production.invalid:2375', 'ssh://host.invalid', 'unix:///tmp/other-docker.sock']) {
  test('resolver recusa Docker fora do endpoint local aprovado: ' + context, () => {
    const fake = dockerFake({ context });
    assert.throws(() => resolveImages({ images: { edge: 'vendor/runtime:v1' } }, fake.command), /nonlocal-docker-context/);
    assert.equal(fake.calls.length, 1);
  });
}
for (const failAt of ['context', 'pull', 'image']) {
  test('erro de ' + failAt + ' interrompe sem devolver mensagem potencialmente sensível', () => {
    const fake = dockerFake({ failAt });
    assert.throws(() => resolveImages({ images: { edge: 'vendor/runtime:v1' } }, fake.command),
      error => error.message === 'docker-' + failAt + '-failed' && !error.message.includes('secret'));
  });
}
for (const digests of [null, [], ['foreign/runtime@sha256:' + DIGEST], ['vendor/runtime@sha256:bad'], ['vendor/runtime@sha256:' + DIGEST, 'vendor/runtime@sha256:' + 'b'.repeat(64)]]) {
  test('metadado sem digest único da origem declarada bloqueia: ' + JSON.stringify(digests), () => {
    const fake = dockerFake({ digests });
    // null is deliberately supplied as a malformed inspect response.
    const command = digests === null ? (file, args, options) => args[2] === 'image' ? { status: 0, stdout: 'null' } : fake.command(file, args, options) : fake.command;
    assert.throws(() => resolveImages({ images: { edge: 'vendor/runtime:v1' } }, command), /missing-or-ambiguous-image-digest/);
  });
}

for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'GITHUB_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY']) {
  test('cliente Docker não herda ambiente/configuração ' + name, () => {
    const prior = process.env[name];
    process.env[name] = 'sentinel-must-not-be-forwarded';
    try {
      const fake = dockerFake();
      resolveImages({ images: { edge: 'vendor/runtime:v1' } }, fake.command);
      for (const call of fake.calls) {
        assert.deepEqual(Object.keys(call.options.env).sort(), ['DOCKER_CONFIG', 'PATH']);
        assert.equal(JSON.stringify(call.options.env).includes('sentinel-must-not-be-forwarded'), false);
      }
    } finally {
      if (prior === undefined) delete process.env[name]; else process.env[name] = prior;
    }
  });
}

for (const [operation, malformed] of [['pull', false], ['image', false], ['image', true]]) {
  test('falha na segunda imagem preserva o primeiro digest: ' + operation + (malformed ? '/JSON inválido' : ''), () => {
    const fake = dockerFake();
    const command = (file, args, options) => {
      if (args[2] === operation && args.includes('vendor/second:v2')) {
        return malformed ? { status: 0, stdout: 'invalid-json-with-private-sentinel' }
          : { status: 1, stdout: '', stderr: 'private-sentinel-must-not-be-logged' };
      }
      return fake.command(file, args, options);
    };
    assert.throws(() => resolveImages({ images: { first: 'vendor/runtime:v1', second: 'vendor/second:v2' } }, command), error => {
      const report = error.resolution;
      assert.equal(report.images.first.proposed, 'vendor/runtime:v1@sha256:' + DIGEST);
      assert.deepEqual(report.failed, { image: 'second', reference: 'vendor/second:v2', operation: operation === 'image' ? 'inspect' : 'pull' });
      assert.equal(report.images.second, undefined);
      assert.equal(JSON.stringify(report).includes('private-sentinel'), false);
      assert.equal(report.sql_executed + report.credentials_generated + report.containers_created + report.e2e_executed, 0);
      return true;
    });
  });
}
