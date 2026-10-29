import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../../', import.meta.url);
const plano = (nome) => new URL(`docs/plans/${nome}`, raiz);
const arquivos = [
  'PLANO_ARQUIVAR_E_CONTADORES_2026-10-11.md',
  'PLANO_BADGE_ARQUIVADAS_2026-10-11.md',
  'PLANO_CONTADORES_ACOMPANHAM_FILTROS_2026-10-11.md',
  'PLANO_LOGIN_V3_FUNDO_TEXTOS_2026-10-11.md',
  'PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md',
  'PLANO_VOLUME_DIAL_2026-10-11.md',
];

test('planos de 11/10 existem e o plano v2 de Tarefas preserva as 200 etapas', async () => {
  for (const arquivo of arquivos) {
    const conteudo = await readFile(plano(arquivo), 'utf8');
    assert.match(conteudo, /^# Plano:/, `${arquivo} precisa ser um plano nomeado`);
  }

  const tarefas = await readFile(plano('PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md'), 'utf8');
  assert.match(tarefas, /v2 \(11\/10\/2026, tarde\).*revisão adversarial/);
  assert.match(tarefas, /49 cartões propostos \(menores; cada um de interface ou dados traz os próprios testes\)/);
  assert.match(tarefas, /Este plano não exige migration, Edge Function nem dependência nova/);

  const etapas = [...tarefas.matchAll(/^\| (\d{3}) \|/gm)].map((m) => Number(m[1]));
  assert.equal(etapas.length, 200);
  assert.deepEqual(etapas, Array.from({ length: 200 }, (_, i) => i + 1));
});
