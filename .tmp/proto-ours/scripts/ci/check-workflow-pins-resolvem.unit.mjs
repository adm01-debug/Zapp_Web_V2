import test from 'node:test';
import assert from 'node:assert/strict';
import { coletarPins, commitDaTag, verificarPins } from './check-workflow-pins-resolvem.mjs';

const REAL = 'f49aabe0b5af0936a0987cfb85d86b75731b0186';
const INVENTADO = 'f49aabe0b5af0936a0987cfb85d86b75b3f07db4'; // o pin do scorecard.yml até 15/10/2026
const TAG_OBJ = 'ea651e62978af7915d09fe2e282747c798bf2dab';
const LS_ANOTADA = `${TAG_OBJ}\trefs/tags/v2.4.1\n${REAL}\trefs/tags/v2.4.1^{}\n`;

test('coleta pins únicos, com subcaminho de Action e o arquivo de origem', () => {
  const pins = coletarPins([
    ['a.yml', `      - uses: github/codeql-action/init@${REAL} # v4.38.3\n      - uses: github/codeql-action/analyze@${REAL} # v4.38.3`],
    ['b.yml', `        uses: ossf/scorecard-action@${INVENTADO} # v2.4.1`],
    ['c.yml', `        uses: actions/checkout@${REAL}`],
  ]);
  assert.equal(pins.length, 3);
  assert.deepEqual(pins.map((p) => [p.repo, p.tag]), [['github/codeql-action', 'v4.38.3'], ['ossf/scorecard-action', 'v2.4.1'], ['actions/checkout', null]]);
});

test('commit da tag: anotada usa o ^{}; leve usa o próprio ref', () => {
  assert.equal(commitDaTag(LS_ANOTADA, 'v2.4.1'), REAL);
  assert.equal(commitDaTag(`${REAL}\trefs/tags/v1.0.0\n`, 'v1.0.0'), REAL);
  assert.equal(commitDaTag('', 'v9.9.9'), null);
});

test('reprova o pin inventado do scorecard (32 caracteres certos, 8 inventados)', async () => {
  const problemas = await verificarPins(
    [{ repo: 'ossf/scorecard-action', sha: INVENTADO, tag: 'v2.4.1', arquivos: new Set(['scorecard.yml']) }],
    async () => LS_ANOTADA,
  );
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /≠ commit real da tag f49aabe0b5af0936a0987cfb85d86b75731b0186/);
});

test('aprova o pin real; reprova tag inexistente, pin sem comentário e falha de consulta', async () => {
  const ok = await verificarPins([{ repo: 'ossf/scorecard-action', sha: REAL, tag: 'v2.4.1', arquivos: new Set(['x.yml']) }], async () => LS_ANOTADA);
  assert.deepEqual(ok, []);
  const ruins = await verificarPins([
    { repo: 'o/r', sha: REAL, tag: 'v0.0.0-nao-existe', arquivos: new Set(['x.yml']) },
    { repo: 'o/r', sha: REAL, tag: null, arquivos: new Set(['y.yml']) },
    { repo: 'o/falha', sha: REAL, tag: 'v1', arquivos: new Set(['z.yml']) },
  ], async (repo) => {
    if (repo === 'o/falha') throw new Error('rede');
    return '';
  });
  assert.equal(ruins.length, 3);
  assert.match(ruins[0], /a tag não existe/);
  assert.match(ruins[1], /pin sem comentário/);
  assert.match(ruins[2], /não foi possível consultar/);
});
