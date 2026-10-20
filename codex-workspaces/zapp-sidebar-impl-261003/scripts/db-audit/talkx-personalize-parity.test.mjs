import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// X020 — Paridade front/edge da personalização.
//
// Como rodar (a partir da raiz do repo):
//   node scripts/db-audit/talkx-personalize-parity.test.mjs
//
// O que faz: lê o fixture COMPARTILHADO
// `scripts/db-audit/fixtures/talkx-personalize-parity.json`, roda o kernel do
// edge (`supabase/functions/_shared/messaging/personalize.ts`) e a prévia do
// front (`src/components/talkx/kit/personalize.ts`) sobre os MESMOS
// casos e exige que o texto produzido seja idêntico — 12 de 12. O mesmo fixture
// é lido pelo teste Deno e pelo teste front (vitest).
//
// O lado edge roda em `deno eval` (importa os dois módulos .ts diretamente, sem
// bundler); o lado front é importado no mesmo processo Deno porque é um módulo
// puro, sem React — o objetivo do teste é comparar a LÓGICA, não o bundler.

const fixtureUrl = new URL('./fixtures/talkx-personalize-parity.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));

const edgeModule = new URL('../../supabase/functions/_shared/messaging/personalize.ts', import.meta.url).href;
const frontModule = new URL('../../src/components/talkx/kit/personalize.ts', import.meta.url).href;
const fixtureJson = JSON.stringify(fixture);

const denoProgram = `
const edge = await import(Deno.args[0]);
const front = await import(Deno.args[1]);
const fixture = JSON.parse(Deno.args[2]);
const out = [];
for (const c of fixture.cases) {
  const contact = c.contact ?? {};
  const customValues = c.customValues ?? {};
  const timeZone = c.timeZone ?? "America/Sao_Paulo";
  const edgeResult = edge.personalize(c.template, contact, customValues, timeZone, c.trackingUrl);
  const frontText = front.personalizePreview(c.template, contact, customValues, timeZone, c.trackingUrl);
  out.push({ id: c.id, edge: edgeResult.text, front: frontText, expect: c.expect ?? null });
}
console.log(JSON.stringify(out));
`;

// O fixture vai como ARGUMENTO (não por arquivo): `deno eval` não aceita
// `--allow-read`, e imports locais de .ts não exigem permissão. Assim o script
// roda sem nenhuma flag de permissão.
function denoEval(program) {
  try {
    return execFileSync('deno', ['eval', program, edgeModule, frontModule, fixtureJson], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `falha ao rodar "deno eval" (o deno precisa estar no PATH): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function runDenoParity() {
  const raw = denoEval(denoProgram);
  const lastLine = raw.trim().split('\n').filter((l) => l.trim().startsWith('[')).pop();
  assert.ok(lastLine, `saída do deno sem JSON: ${raw}`);
  return JSON.parse(lastLine);
}

test('Talk X personalize (edge) e personalizePreview (front) produzem o MESMO texto — 12/12 do fixture', () => {
  const results = runDenoParity();
  assert.equal(results.length, 12, `o fixture deve ter 12 casos, veio ${results.length}`);
  const mismatches = results.filter((r) => r.edge !== r.front);
  assert.equal(
    mismatches.length,
    0,
    `front/edge divergiram em ${mismatches.length} caso(s): ${JSON.stringify(mismatches)}`,
  );
  const expectedFailures = results.filter((r) => r.expect !== null && r.edge !== r.expect);
  assert.equal(
    expectedFailures.length,
    0,
    `texto divergente do esperado: ${JSON.stringify(expectedFailures)}`,
  );
});

test('Talk X preview resolve os built-ins novos (vendedor/telefone/data) e o padrão "{{chave|padrão}}"', () => {
  // Além da paridade, trava a regra X020 no front para os casos que o fixture
  // não fixa (datas dependem do dia).
  const results = runDenoParity();
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId['builtin-vendedor'].front, 'Falar com Maria Souza');
  assert.equal(byId['builtin-telefone'].front, 'Tel: +55 11 98888-7777');
  assert.equal(byId['fallback-padrao-nome'].front, 'Ola cliente');
  assert.equal(byId['custom-padrao'].front, 'Cargo: Não informado');
});

test('Talk X {{data_atual}} e {{data}} formatam dd/mm/aaaa no fuso nos dois lados', () => {
  const denoProgramDates = `
const edge = await import(Deno.args[0]);
const front = await import(Deno.args[1]);
const contact = { name: "João Silva", nickname: "João", company: "Loja Central", phone: "119", vendedor: "Maria" };
const edgeText = edge.personalize("Hoje {{data_atual}} == {{data}}", contact, {}, "America/Sao_Paulo").text;
const frontText = front.personalizePreview("Hoje {{data_atual}} == {{data}}", contact, {}, "America/Sao_Paulo");
console.log(JSON.stringify({ edgeText, frontText }));
`;
  const raw = execFileSync(
    'deno',
    ['eval', denoProgramDates, edgeModule, frontModule],
    { encoding: 'utf8' },
  );
  const { edgeText, frontText } = JSON.parse(raw.trim().split('\n').pop());
  assert.equal(edgeText, frontText, `front/edge divergiram na data: ${edgeText} != ${frontText}`);
  assert.match(edgeText, /^Hoje \d{2}\/\d{2}\/\d{4} == \d{2}\/\d{2}\/\d{4}$/);
});
