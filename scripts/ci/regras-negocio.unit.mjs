import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const publishScript = fileURLToPath(new URL('../regras_negocio/publish.sh', import.meta.url));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

// Reutiliza no CI obrigatório a suíte Python do produtor, sem duplicar os testes.
test('gerador de regras: regressões offline de fontes SQL', () => {
  execFileSync('python3', [fileURLToPath(new URL('../regras_negocio/test_generate.py', import.meta.url))], {
    encoding: 'utf8', stdio: 'pipe', timeout: 60_000,
  });
});

test('publicador preserva trabalho local quando o push falha', () => {
  const root = mkdtempSync(join(tmpdir(), 'regras-publish-'));
  const remote = join(root, 'remote.git');
  const checkout = join(root, 'checkout');
  try {
    git(root, 'init', '--bare', '-q', remote);
    git(root, 'init', '-q', '-b', 'main', checkout);
    git(checkout, 'config', 'user.email', 'audit@example.invalid');
    git(checkout, 'config', 'user.name', 'Audit');
    mkdirSync(join(checkout, 'docs', 'ai-context'), { recursive: true });
    writeFileSync(join(checkout, 'user.txt'), 'baseline\n');
    writeFileSync(join(checkout, 'docs', 'ai-context', 'generated.md'), 'old\n');
    git(checkout, 'add', '.');
    git(checkout, 'commit', '-qm', 'baseline');
    git(checkout, 'remote', 'add', 'origin', remote);
    git(checkout, 'push', '-q', '-u', 'origin', 'main');
    git(checkout, 'remote', 'set-url', '--push', 'origin', join(root, 'missing.git'));

    writeFileSync(join(checkout, 'user.txt'), 'UNCOMMITTED USER WORK\n');
    writeFileSync(join(checkout, 'docs', 'ai-context', 'generated.md'), 'new\n');
    const generator = join(checkout, 'fail-generator.sh');
    writeFileSync(generator, '#!/usr/bin/env bash\nexit 9\n');
    chmodSync(generator, 0o700);

    const result = spawnSync('bash', [publishScript], {
      cwd: checkout,
      encoding: 'utf8',
      env: {
        ...process.env,
        BRANCH: 'main',
        OUT_DIR: 'docs/ai-context',
        MODE: 'push',
        GEN_CMD: './fail-generator.sh',
      },
      timeout: 30_000,
    });
    assert.equal(result.status, 9, result.stderr);
    assert.equal(readFileSync(join(checkout, 'user.txt'), 'utf8'), 'UNCOMMITTED USER WORK\n');
    assert.match(git(checkout, 'status', '--short'), /user\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publicador não emenda commit alheio quando rebase descarta patch equivalente', () => {
  const root = mkdtempSync(join(tmpdir(), 'regras-publish-equivalent-'));
  const remote = join(root, 'remote.git');
  const checkout = join(root, 'checkout');
  const peer = join(root, 'peer');
  try {
    git(root, 'init', '--bare', '-q', remote);
    git(root, 'init', '-q', '-b', 'main', checkout);
    git(checkout, 'config', 'user.email', 'local@example.invalid');
    git(checkout, 'config', 'user.name', 'Local');
    mkdirSync(join(checkout, 'docs', 'ai-context'), { recursive: true });
    writeFileSync(join(checkout, 'docs', 'ai-context', 'generated.md'), 'old\n');
    git(checkout, 'add', '.');
    git(checkout, 'commit', '-qm', 'baseline');
    git(checkout, 'remote', 'add', 'origin', remote);
    git(checkout, 'push', '-q', '-u', 'origin', 'main');
    git(root, `--git-dir=${remote}`, 'symbolic-ref', 'HEAD', 'refs/heads/main');

    git(root, 'clone', '-q', remote, peer);
    git(peer, 'config', 'user.email', 'peer@example.invalid');
    git(peer, 'config', 'user.name', 'Peer');
    writeFileSync(join(peer, 'docs', 'ai-context', 'generated.md'), 'new\n');
    git(peer, 'add', '.');
    git(peer, 'commit', '-qm', 'chore: aplica conteúdo equivalente');
    writeFileSync(join(peer, 'peer.txt'), 'trabalho concorrente\n');
    git(peer, 'add', '.');
    git(peer, 'commit', '-qm', 'feat: preserva trabalho concorrente');
    git(peer, 'push', '-q', 'origin', 'main');

    writeFileSync(join(checkout, 'docs', 'ai-context', 'generated.md'), 'new\n');
    const generator = join(root, 'regenerate.sh');
    writeFileSync(generator, `#!/usr/bin/env bash
set -euo pipefail
printf 'regenerated\\n' > docs/ai-context/generated.md
`);
    chmodSync(generator, 0o700);

    const result = spawnSync('bash', [publishScript], {
      cwd: checkout,
      encoding: 'utf8',
      env: {
        ...process.env,
        BRANCH: 'main',
        OUT_DIR: 'docs/ai-context',
        MODE: 'push',
        GEN_CMD: generator,
      },
      timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    git(checkout, 'fetch', '-q', 'origin', 'main');
    assert.equal(git(checkout, 'show', 'origin/main:docs/ai-context/generated.md'), 'regenerated\n');
    assert.equal(git(checkout, 'show', 'origin/main:peer.txt'), 'trabalho concorrente\n');
    assert.equal(git(checkout, 'log', '-1', '--format=%s', 'origin/main').trim(),
      'chore(ai-context): atualiza contexto para agentes [skip ci]');
    assert.equal(git(checkout, 'log', '-1', '--format=%ae', 'origin/main').trim(),
      'ai-context-bot@users.noreply.github.com');
    assert.equal(git(checkout, 'log', '-1', '--format=%s', 'origin/main^').trim(),
      'feat: preserva trabalho concorrente');
    assert.equal(git(checkout, 'log', '-1', '--format=%ae', 'origin/main^').trim(),
      'peer@example.invalid');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
