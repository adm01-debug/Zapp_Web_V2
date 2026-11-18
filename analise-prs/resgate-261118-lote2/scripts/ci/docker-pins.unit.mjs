import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// GA87: Go alinhado — tag do Dockerfile == toolchain (.github/toolchain.json,
// chave `go`), sempre com digest. Decide a #1956: sem build no CI a imagem
// andava sozinha (golang 1.27 no Dockerfile, 1.24 no go.mod/toolchain).

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ler() {
  const toolchain = JSON.parse(readFileSync(join(RAIZ, '.github', 'toolchain.json'), 'utf8'));
  const dockerfile = readFileSync(join(RAIZ, 'infrastructure', 'preview-egress-proxy', 'Dockerfile'), 'utf8');
  const gomod = readFileSync(join(RAIZ, 'infrastructure', 'preview-egress-proxy', 'go.mod'), 'utf8');
  return { toolchain, dockerfile, gomod };
}

describe('docker-pins (GA87)', () => {
  it('tag golang do Dockerfile acompanha o major.minor do toolchain', () => {
    const { toolchain, dockerfile } = ler();
    const m = /^FROM golang:([0-9]+\.[0-9]+[^@\s]*)@sha256:[0-9a-f]{64}/m.exec(dockerfile);
    assert.ok(m, 'FROM golang sem tag+digest');
    const baseToolchain = String(toolchain.go).replace(/\.x$/, '');
    assert.ok(
      m[1] === baseToolchain || m[1].startsWith(`${baseToolchain}-`) || m[1].startsWith(`${baseToolchain}.`),
      `Dockerfile golang:${m[1]} != toolchain go ${toolchain.go}`,
    );
  });

  it('go.mod na mesma familia do toolchain', () => {
    const { toolchain, gomod } = ler();
    const m = /^go ([0-9]+\.[0-9]+)/m.exec(gomod);
    assert.ok(m, 'go.mod sem diretiva go');
    const baseToolchain = String(toolchain.go).replace(/\.x$/, '');
    assert.ok(
      m[1] === baseToolchain || baseToolchain.startsWith(m[1]),
      `go.mod ${m[1]} != toolchain go ${toolchain.go}`,
    );
  });

  it('Dockerfile sem imagem sem digest', () => {
    const { dockerfile } = ler();
    for (const linha of dockerfile.split('\n')) {
      const f = /^FROM (\S+)/.exec(linha.trim());
      if (!f) continue;
      assert.ok(f[1].includes('@sha256:'), `FROM sem digest: ${f[1]}`);
    }
  });
});
