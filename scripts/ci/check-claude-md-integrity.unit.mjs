import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENTS,
  CLAUDE,
  REQUIRED_SECTIONS,
  SKILL_NAME,
  erroDeEncolhimento,
  referenciasDocsInvalidas,
  secoesFaltando,
  skillsDivergentes,
} from './check-claude-md-integrity.mjs';

const agentsCompleto = REQUIRED_SECTIONS.join('\n\n');

test('aceita AGENTS.md com todas as secoes obrigatorias', () => {
  assert.deepEqual(secoesFaltando(agentsCompleto), []);
});

test('acusa secao obrigatoria apagada por outra sessao', () => {
  const sem = agentsCompleto.replace('## Fluxo Git', '');
  const erros = secoesFaltando(sem);
  assert.equal(erros.length, 1);
  assert.match(erros[0], /## Fluxo Git/);
});

test('acusa referencia quebrada e referencia orfa em docs/agentes', () => {
  assert.deepEqual(referenciasDocsInvalidas('ler `docs/agentes/banco.md`', ['banco.md']), []);
  assert.match(referenciasDocsInvalidas('ler `docs/agentes/banco.md`', [])[0], /nao existe/);
  assert.match(
    referenciasDocsInvalidas('nada aqui', ['vercel-deploy.md'])[0],
    /referencia orfa/,
  );
});

test('ignora o placeholder docs/agentes/<tema>.md citado na introducao', () => {
  assert.deepEqual(referenciasDocsInvalidas('detalhe em `docs/agentes/<tema>.md`', []), []);
});

const skill = `---\nname: ${SKILL_NAME}\ndescription: Convencoes do repo.\n---\n\n# corpo\n`;

test('exige os dois skills identicos', () => {
  assert.deepEqual(skillsDivergentes([skill, skill]), []);
  assert.match(skillsDivergentes([skill, `${skill}divergiu\n`])[0], /difere de/);
});

test('barra o conjunto encolhendo mais de 30%', () => {
  const base = { total: 1000, porArquivo: new Map([[AGENTS, 800], [CLAUDE, 200]]) };
  assert.deepEqual(erroDeEncolhimento({ total: 1000, porArquivo: { [AGENTS]: 800, [CLAUDE]: 200 } }, base), []);
  const erros = erroDeEncolhimento({ total: 600, porArquivo: { [AGENTS]: 400, [CLAUDE]: 200 } }, base);
  assert.match(erros[0], /encolheram 40%/);
});

test('barra um unico arquivo esvaziado ou apagado, mesmo com o total dentro do limite', () => {
  const base = { total: 10000, porArquivo: new Map([[AGENTS, 8000], ['docs/agentes/banco.md', 2000]]) };
  const esvaziado = erroDeEncolhimento({ total: 8500, porArquivo: { [AGENTS]: 8000, 'docs/agentes/banco.md': 500 } }, base);
  assert.equal(esvaziado.length, 1);
  assert.match(esvaziado[0], /docs\/agentes\/banco\.md encolheu 75%/);
  const apagado = erroDeEncolhimento({ total: 8000, porArquivo: { [AGENTS]: 8000 } }, base);
  assert.match(apagado[0], /sumiu/);
});

test('sem base (ref inexistente) a comparacao e no-op', () => {
  assert.deepEqual(erroDeEncolhimento({ total: 1, porArquivo: { [AGENTS]: 1 } }, null), []);
});
