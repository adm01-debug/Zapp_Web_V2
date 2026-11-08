import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// VOL-05 (#480) distingue a evidência histórica de 01/10 da preparação atual.
// Os sete contratos documentais abaixo preservam o fechamento daquele run: 38
// passaram/1 falhou, sem playback real nem fixture de áudio criada em produção.
// Esse registro não é reescrito pela posterior autorização do backend descartável.
//
// O spec atual possui áudio canônico no ambiente isolado. Sua preparação, bytes,
// identidade por usuário, cardinalidade e metadados são exercitados pelos 51 casos
// de e2e-media-volume-fixture.unit.mjs, no mesmo glob obrigatório de Node.
// Estes dois guardas finais verificam a declaração ativa e o limite da evidência:
// volume inicial/metadados não são audição, play() ou transcrição comprovados.
// A coleta abaixo executa declarações reais do spec, sem callbacks de navegador;
// texto em comentário/string não equivale a um teste registrado.

const ler = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

const PLANO_REL = '../../docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md';
const SPEC_REL = '../../e2e/media-volume.spec.ts';

// Compara sem acento, sem caixa e sem marcação Markdown, com o texto reflowado numa
// linha só — a prosa é hard-wrapped à mão e a guarda não deve quebrar quando alguém
// re-embrulhar um parágrafo.
const limpo = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** Recorta `## <n>. ...` até o próximo `## ` (ou o fim) e normaliza. */
function secao(texto, numero) {
  const m = texto.match(new RegExp(`(?:^|\\n)## ${numero}(?=\\s|$)([\\s\\S]*?)(?=\\n## |$)`));
  return m ? limpo(m[1]) : '';
}

/**
 * Predicado real da guarda: devolve a lista de defeitos de honestidade do fechamento
 * do volume. Vazio = a evidência documental está qualificada.
 */
export function auditarEvidenciaVolume(planoTexto) {
  const problemas = [];
  const criterios = secao(planoTexto, '4\\.');
  const fechamento = secao(planoTexto, '7\\.');

  // (1) O critério de aceite da audição dos alertas não pode declarar prova "à mão
  //     (E49)" enquanto a E49 registrada no fechamento é um run de UI.
  if (/audive[il]s[^.]{0,200}(a mao|\(e49\))/.test(criterios)) {
    problemas.push('criterio-3-afirma-prova-auditiva-manual');
  }

  // (2) O fechamento não pode declarar audição/playback real comprovados.
  if (/(ouvid|escutad|playback real|som real|audio real)[^.]{0,80}(provad|valid|confirmad)/.test(fechamento)) {
    problemas.push('fechamento-afirma-playback-real');
  }

  // (3) O fechamento não pode declarar fixture/mensagem de áudio criada ou semeada.
  if (/(cri(ei|ou|ada|ado)|seme(ei|ou|ada|ado)|inser(i|iu)|gravei|gravou|gravad)[^.]{0,40}(fixture|mensagem de audio)/.test(fechamento)) {
    problemas.push('fechamento-afirma-fixture-de-audio');
  }

  // (4) O fechamento precisa explicitar que o run NÃO prova audição/playback.
  if (!/(nao|nem)[^.]{0,60}(prova|mede|ouv)[^.]{0,60}(audio|audicao|playback|som)/.test(fechamento)) {
    problemas.push('fechamento-sem-ressalva-de-audicao');
  }

  // (5) O fechamento precisa manter a distinção do run: passes + falha declarados, com a
  //     falha explicitamente fora do volume (o número é histórico; a REGRA é não atribuir a
  //     falha ao volume nem esconder o placar).
  if (!(/\d+ (passaram|passes)/.test(fechamento) && /\d+ falhou/.test(fechamento) && /nao e (de|do) volume/.test(fechamento))) {
    problemas.push('fechamento-perdeu-distincao-do-run');
  }

  // (6) O estado da fixture de áudio (não autorizada/criada) precisa estar registrado.
  if (!/(nao autorizad|nenhuma fixture de audio foi criad)/.test(fechamento)) {
    problemas.push('fechamento-sem-estado-da-fixture');
  }

  return problemas;
}

// --- Fixtures: provam que o predicado REAL pega o defeito e não pega o honesto. ---

const CRITERIO_MAU = `## 4. Critérios de aceite do conjunto
3. Com mídia em mudo, os alertas continuam audíveis no volume configurado — provado por teste (E38–E40) e à mão (E49).
`;

const SECAO_HONESTA = `## 7. Estado de execução (fechamento)
E49: o run de UI não prova audição/playback real; nenhuma fixture de áudio foi criada (não autorizado).
**run de validação:** 38 passaram, 1 falhou, e a falha não é de volume.
`;

test('fixture: critério declarando prova auditiva "à mão (E49)" é rejeitado', () => {
  const problemas = auditarEvidenciaVolume(CRITERIO_MAU + SECAO_HONESTA);
  assert.ok(
    problemas.includes('criterio-3-afirma-prova-auditiva-manual'),
    `o predicado tinha de acusar o critério com prova auditiva manual; veio: ${JSON.stringify(problemas)}`,
  );
});

test('fixture: fechamento afirmando playback real é rejeitado', () => {
  const problemas = auditarEvidenciaVolume(
    `## 7. Estado de execução
O áudio do balão foi ouvido no volume escolhido e o playback real foi validado no aparelho.
`,
  );
  assert.ok(
    problemas.includes('fechamento-afirma-playback-real'),
    `o predicado tinha de acusar a alegação de playback real; veio: ${JSON.stringify(problemas)}`,
  );
});

test('fixture: fechamento afirmando fixture de áudio criada é rejeitado', () => {
  const problemas = auditarEvidenciaVolume(
    `## 7. Estado de execução
Criei uma mensagem de áudio no contato de fixture e semeei o objeto no bucket.
`,
  );
  assert.ok(
    problemas.includes('fechamento-afirma-fixture-de-audio'),
    `o predicado tinha de acusar a fixture criada; veio: ${JSON.stringify(problemas)}`,
  );
});

test('fixture: fechamento sem a distinção do run é rejeitado', () => {
  const problemas = auditarEvidenciaVolume(
    `## 7. Estado de execução
O spec de volume passou; nenhuma fixture de áudio foi criada (não autorizado) e o run não prova audição/playback real.
`,
  );
  assert.ok(
    problemas.includes('fechamento-perdeu-distincao-do-run'),
    `o predicado tinha de exigir a distinção do run; veio: ${JSON.stringify(problemas)}`,
  );
});

test('fixture: evidência honesta (critério qualificado + fechamento com ressalva) passa limpa', () => {
  const honesto = `## 4. Critérios de aceite do conjunto
3. Com mídia em mudo, os alertas continuam audíveis no volume configurado — a fiação é provada por teste (E38–E40); a audição real não foi medida (ver §7.4).
${SECAO_HONESTA}`;
  assert.deepEqual(auditarEvidenciaVolume(honesto), []);
});

// --- Documento real: vermelho enquanto o plano alegar prova de audição. ---

const plano = await ler(PLANO_REL);

test('VOL-05: a evidência do fechamento do volume permanece qualificada', () => {
  assert.deepEqual(
    auditarEvidenciaVolume(plano),
    [],
    'o plano de volume está declarando prova de audição/playback ou perdendo a qualificação do fechamento',
  );
});

test('VOL-05: o fechamento mantém a distinção do run (falha alheia ao resultado de volume)', () => {
  const fechamento = secao(plano, '7\\.');
  assert.match(fechamento, /\d+ (passaram|passes)/, 'o fechamento perdeu o placar do run de validação');
  assert.match(fechamento, /\d+ falhou/, 'o fechamento perdeu o registro da falha do run');
  assert.match(fechamento, /nao e (de|do) volume/, 'o fechamento precisa manter que a falha NÃO é do volume');
});

// --- Spec atual: fixture isolada ativa, sem promovê-la a prova de playback. ---

const AUDIO_TITLE = 'se a conversa do fixture tiver áudio, o elemento nasce no volume escolhido';

// Execute collection, never browser callbacks: comments and strings cannot register
// a test. Real fixture/identity/readiness behavior remains covered by the existing
// e2e-media-volume-fixture.unit.mjs, without running that suite a second time in CI.
function auditDeclarations(source) {
  const cases = [];
  const register = kind => (title, callback) => cases.push({ kind, title, callable: typeof callback === 'function' });
  const test = register('test');
  test.fixme = register('fixme'); test.skip = register('skip'); test.only = register('only');
  test.describe = (_title, callback) => callback();
  test.beforeEach = test.afterAll = () => {};
  test.use = test.setTimeout = () => {};
  const globals = { test, E2E_ARQUIVOS: {
      usuario: { email: 'synthetic@example.test', senha: 'synthetic-password' },
      contato: { id: 'synthetic-contact', nomeVisivel: 'Synthetic' },
      mensagens: { audio: { objeto: 'synthetic.ogg' } },
    },
    MEDIA_VOLUME_LABEL: 'media', MEDIA_VOLUME_LABEL_MUTED: 'muted', MEDIA_VOLUME_SLIDER_LABEL: 'slider',
    SOUND_VOLUME_LABEL: 'alert', SOUND_VOLUME_LABEL_MUTED: 'alert-muted' };
  try {
    const code = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\s*$/gm, '');
    vm.runInNewContext(code, globals, { timeout: 1000 });
  } catch { return ['spec-collection-failed']; }
  const audio = cases.filter(item => item.title === AUDIO_TITLE);
  const issues = [];
  if (cases.length !== 3 || cases.some(item => item.kind !== 'test' || !item.callable)) issues.push('spec-cases-not-all-active');
  if (audio.length !== 1 || audio[0].kind !== 'test' || !audio[0].callable) issues.push('audio-case-not-active-and-unique');
  return issues;
}

function auditCurrentDisclosure(source) {
  // These are source documentation assertions, not a claim of native playback.
  const text = limpo(source.split('\n').filter(line => /^\s*\/\//.test(line)).map(line => line.replace(/^\s*\/\/\s?/, '')).join('\n'));
  const issues = [];
  if (!/backend descartavel isolado/.test(text)) issues.push('current-scope-not-isolated');
  if (!/arquivos-local\/seed\.ts[^.]{0,100}storage\/rls[^.]{0,100}mesmo usuario/.test(text)) issues.push('current-fixture-chain-undocumented');
  if (!/metadados do audio canonico assinado pelo fluxo real do player/.test(text)) issues.push('current-evidence-not-metadata');
  if (!/nao afirma reproducao audivel, play\(\) ou transcricao/.test(text)) issues.push('current-playback-limit-missing');
  if (/(reproducao audivel|playback real|audio real)[^.]{0,80}(comprovad|validad|confirmad)/.test(text)) issues.push('current-claims-native-playback');
  return issues;
}

const spec = await ler(SPEC_REL);

test('VOL-05: o caso de volume do áudio está ativo e único no spec atual', () => {
  assert.deepEqual(auditDeclarations(spec), [], 'o caso de áudio semeado precisa permanecer ativo e único');
});

test('VOL-05: o spec atual limita a evidência a fixture isolada, metadados e volume', () => {
  assert.deepEqual(auditCurrentDisclosure(spec), [], 'o spec perdeu a cadeia da fixture local ou passou a alegar playback real');
});
