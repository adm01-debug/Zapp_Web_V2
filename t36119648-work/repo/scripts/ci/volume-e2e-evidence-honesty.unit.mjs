import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// VOL-05 (#480) — "E2E publicado comprova controles e persistência, com exceção de
// áudio aceita". A auditoria (docs/reconciliation/FINDINGS.json, VOL-05) é explícita:
// o run de UI do `e2e-logado` prova slider, persistência, mudo e `aria-label` do botão
// de alertas — NÃO é prova de playback real. O caso que mede `<audio>.volume` está
// `test.fixme` e não existe mensagem de áudio no fixture. O `required_fix` manda
// "qualificar a evidência documental" e "manter a exceção explícita de E45"; o aceite
// manda o fechamento continuar registrado "sem afirmar teste audível ou criação de
// fixture" e "distinguir 38 passes/1 falha alheia do resultado específico de volume".
//
// Esta guarda trava as duas pontas para que ninguém promova o run de UI a prova de
// audição (nem reabra o seed de áudio em produção para "fechar" o critério):
//   - o plano não pode declarar audição comprovada — nem "à mão (E49)" no critério de
//     aceite, nem playback real/fixture de áudio no fechamento;
//   - o fechamento precisa manter a ressalva de audição, o estado da fixture e a
//     distinção do run (38 passaram / 1 falhou, falha alheia ao volume);
//   - o spec do E2E mantém a exceção ESTREITA: a asserção de `<audio>.volume` só pode
//     viver dentro do `test.fixme`, nunca num caso que alega passar.

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

// --- Spec real: a exceção de áudio tem de continuar estreita e documentada. ---

const spec = await ler(SPEC_REL);

test('VOL-05: a medição de <audio>.volume só existe dentro do caso test.fixme', () => {
  const ocorrenciasFixme = spec.split('test.fixme(').length - 1;
  assert.equal(ocorrenciasFixme, 1, 'o spec deve ter exatamente um caso test.fixme (o de áudio)');

  const iFixme = spec.indexOf('test.fixme(');
  const iVolume = spec.indexOf('HTMLAudioElement).volume');
  assert.ok(iVolume > 0, 'o spec não mede mais <audio>.volume — a exceção de E45 sumiu sem substituto');
  assert.ok(
    iVolume > iFixme,
    'a asserção de <audio>.volume saiu do test.fixme: um caso que alega passar não pode medir áudio sem fixture',
  );
});

test('VOL-05: o spec continua declarando o que NÃO prova e como reabilitar', () => {
  const texto = limpo(spec);
  assert.match(texto, /nao prova/, 'o spec precisa declarar explicitamente o que não prova');
  assert.match(texto, /fixme/, 'o spec precisa manter o marcador fixme da exceção de E45');
  assert.match(texto, /reabilitar/, 'o spec precisa registrar como reabilitar o caso de áudio');
});
