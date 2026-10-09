import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ambiente } from './lib/ambiente.mjs';
import { CHECKS_E5 } from './lib/especificacao.mjs';

// Prova de PONTA a PONTA dos quatro scripts de QA da Telefonia (T81-T84), offline:
// Chromium headless (o Playwright que o repositório já tem) contra
// `fixtures/telefonia.html` por `file://`. Sem servidor, sem login, sem banco,
// sem produção — a regra R1 do projeto vale para este instrumento.
//
// O que se prova aqui não é "o script imprime OK": é que ele MEDE. A mesma
// fixture, com `?mutar=`, estraga UM eixo de propósito e o script tem de
// reprovar exatamente aquele eixo. É isso que separa medição de carimbo.
//
// Rodar: `node --test qa/tel/provas.unit.mjs`

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const FIXTURE = pathToFileURL(join(AQUI, 'fixtures', 'telefonia.html')).href;

function comEnv(vars, fn) {
  const antigo = {};
  for (const k of Object.keys(vars)) antigo[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antigo)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function rodar(script, mutar = '') {
  const url = mutar ? `${FIXTURE}?mutar=${mutar}` : FIXTURE;
  const r = spawnSync(process.execPath, [join(AQUI, script)], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, TEL_URL: url, TEL_LARGURA: '1672', TEL_ALTURA: '1000' },
  });
  const inicio = r.stdout.indexOf('{');
  let json = null;
  try {
    json = JSON.parse(r.stdout.slice(inicio));
  } catch {
    json = null;
  }
  return { status: r.status, stderr: r.stderr ?? '', json, bruto: r.stdout };
}

/** O valor medido de um eixo, do jeito que o script publicou. */
const valorDe = (json, eixo) => json?.checks?.find((c) => c.eixo === eixo)?.valor;
const check = (json, eixo) => json?.checks?.find((c) => c.eixo === eixo);



describe('ambiente.mjs (R1 local)', () => {
  it('aceita somente file://, localhost e 127.0.0.1', () => {
    assert.equal(comEnv({ TEL_URL: 'file:///fixture-telefonia.html', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: undefined }, () => ambiente().arquivo), true);
    assert.equal(comEnv({ TEL_URL: 'http://localhost:5173', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: undefined }, () => ambiente().base), 'http://localhost:5173');
    assert.equal(comEnv({ TEL_URL: 'http://127.0.0.1:5173', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: '1' }, () => ambiente().base), 'http://127.0.0.1:5173');
    assert.throws(
      () => comEnv({ TEL_URL: 'http://127.0.0.1:5173', TEL_CAMINHO: '@evil.example/path', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: undefined }, () => ambiente()),
      /TEL_URL.*local/i,
    );
    assert.throws(
      () => comEnv({ TEL_URL: 'https://zapp.example.com', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: undefined }, () => ambiente()),
      /TEL_URL.*local/i,
    );
  });

  it('recusa TEL_MUTACAO=1 fora de alvo local', () => {
    assert.throws(
      () => comEnv({ TEL_URL: 'https://zapp.example.com', PLAYWRIGHT_BASE_URL: undefined, TEL_MUTACAO: '1' }, () => ambiente()),
      /TEL_MUTACAO=1.*local/i,
    );
  });
});

describe('measure.mjs (T81/E.2)', () => {
  it('mede a fixture conforme: 17/17 e os números que o CSS declara', () => {
    const { status, json, bruto } = rodar('measure.mjs');
    assert.ok(json, `measure.mjs não publicou JSON:\n${bruto.slice(0, 800)}`);
    assert.equal(json.fail.length, 0, `eixos reprovados: ${json.fail}`);
    assert.equal(json.ok + json.skipped, 17);
    assert.equal(json.skipped, 2);
    assert.equal(json.consoleErrors, 0);
    assert.equal(status, 0, 'verde tem de sair com exit 0');

    // Fonte independente: o CSS da fixture diz 278 / 408 / 56 / 46 / 78 e o
    // script tem de devolver EXATAMENTE isso — não "OK" por conta própria.
    assert.equal(valorDe(json, 'contentX'), 278);
    assert.equal(valorDe(json, 'panel'), 408);
    assert.equal(valorDe(json, 'cta'), 56);
    assert.equal(valorDe(json, 'key'), 46);
    assert.equal(valorDe(json, 'kpiTile'), 78);
    assert.equal(valorDe(json, 'reducedMotion'), 0);
  });

  it('reprova só os eixos que a mutação de geometria estragou', () => {
    const { status, json } = rodar('measure.mjs', 'geometria');
    assert.ok(json);
    assert.equal(status, 1, 'vermelho tem de sair com exit 1');
    assert.deepEqual([...json.fail].sort(), ['contentX', 'panel']);
    assert.equal(valorDe(json, 'contentX'), 300, 'a fixture mutada moveu o conteúdo para 300');
    assert.equal(valorDe(json, 'panel'), 500, 'a fixture mutada alargou o painel para 500');
    assert.equal(check(json, 'contentX').alvo, 278);
  });
});

describe('colors.mjs (T82/E.3)', () => {
  it('aprova a pintura fiel: ΔE 0 contra os tokens da página', () => {
    const { status, json } = rodar('colors.mjs');
    assert.ok(json);
    assert.equal(status, 0);
    assert.equal(json.fail.length, 0, `eixos reprovados: ${json.fail}`);
    assert.equal(json.ok, 7);
    for (const c of json.checks) assert.equal(c.valor, 0, `${c.eixo} tinha de dar ΔE 0`);
    assert.equal(json.checks.find((c) => c.eixo === 'cta/success').esperado, 'rgb(21, 117, 85)');
  });

  it('reprova o botão que fugiu do token, com o ΔE medido', () => {
    const { status, json } = rodar('colors.mjs', 'cor');
    assert.ok(json);
    assert.equal(status, 1);
    assert.deepEqual(json.fail, ['cta/success']);
    const c = check(json, 'cta/success');
    assert.equal(c.pintado, 'rgb(61, 153, 245)');
    assert.ok(c.valor > 2, `ΔE ${c.valor} tinha de passar de 2`);
  });
});

describe('axe.mjs (T84/E.5)', () => {
  it('tela conforme: nenhuma violação serious/critical', () => {
    const { status, json } = rodar('axe.mjs');
    assert.ok(json);
    assert.equal(status, 0);
    assert.equal(json.fail.length, 0);
    assert.equal(valorDe(json, 'axe/tela-ociosa'), 0);
  });

  it('reprova o botão sem nome acessível e o texto de baixo contraste', () => {
    const { status, json } = rodar('axe.mjs', 'axe');
    assert.ok(json);
    assert.equal(status, 1);
    assert.deepEqual(json.fail, ['axe/tela-ociosa']);
    const ids = check(json, 'axe/tela-ociosa').violacoes.map((v) => v.id).sort();
    assert.deepEqual(ids, ['button-name', 'color-contrast']);
  });
});

describe('func.mjs (T83/E.5)', () => {
  it('publica os 20 passos do plano, na ordem, com o console limpo e skips explícitos', () => {
    const { status, json } = rodar('func.mjs');
    assert.ok(json);
    assert.deepEqual(json.checks.map((c) => c.eixo), [...CHECKS_E5]);
    assert.equal(json.total, 20);
    assert.equal(json.consoleErrors, 0);
    assert.equal(check(json, 'console sem error').ok, true);
    assert.equal(status, 1, 'a fixture conforme deixa a aba VoIP falhar de propósito e precisa explicar isso');
    assert.ok(json.skipped >= 1, 'passos não aplicáveis na fixture precisam sair como skip explícito');
    assert.equal(check(json, 'periodo muda KPIs').skip, true);
    assert.equal(check(json, 'discar -> dialing -> Cancelar -> linha cancelled').skip, true);
  });

  it('não aprova aba VoIP quando o clique não seleciona a aba', () => {
    const { json } = rodar('func.mjs');
    assert.ok(json);
    const c = check(json, 'aba VoIP');
    assert.equal(c.ok, false);
    assert.match(c.motivo, /selecion/i);
  });



  it('não aprova busca quando digitar não muda linhas nem mostra vazio/URL', () => {
    const { json } = rodar('func.mjs', 'busca-ignorada');
    assert.ok(json);
    const nome = check(json, 'busca nome');
    assert.equal(nome.ok, false);
    assert.match(nome.motivo, /não reduziu|estado vazio/i);
    const numero = check(json, 'busca numero');
    assert.equal(numero.ok, false);
    assert.match(numero.motivo, /não filtrou|URL\/estado/i);
  });

  it('explica como skip quando os passos de busca não têm campo para executar', () => {
    const { json } = rodar('func.mjs', 'sem-busca');
    assert.ok(json);
    assert.equal(check(json, 'busca nome').skip, true);
    assert.match(check(json, 'busca nome').motivo, /campo de busca ausente/i);
    assert.equal(check(json, 'busca numero').skip, true);
    assert.match(check(json, 'busca numero').motivo, /campo de busca ausente/i);
  });

  it('não aprova deep link que abre painel para call inexistente', () => {
    const { json } = rodar('func.mjs', 'deep-link-painel');
    assert.ok(json);
    const c = check(json, 'deep link');
    assert.equal(c.ok, false);
    assert.match(c.motivo, /call inexistente abriu painel/i);
  });

  it('o erro de console da fixture aparece e reprova — não passa mudo', () => {
    const { json } = rodar('func.mjs', 'console');
    assert.ok(json);
    assert.ok(json.consoleErrors >= 1, 'o erro proposital tinha de ser contado');
    const c = check(json, 'console sem error');
    assert.equal(c.ok, false);
    assert.ok(c.valor >= 1);
    assert.match(c.erros.join(' '), /erro proposital da fixture/);
  });
});
