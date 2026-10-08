import test from 'node:test';
import assert from 'node:assert/strict';

// SL-123 (08/10/2026) — piso de cobertura POR ARQUIVO (`perFile: true`).
//
// O piso do vitest.config.ts era só AGREGADO por glob, e o agregado escondia arquivo que
// não cumpria o piso do grupo. No escopo do módulo do mapa (`src/lib/mapbox*` +
// `src/components/inbox/location-picker/**` + ContactForm.tsx) o agregado medido em 02/10
// era 91,97% de linhas / 79,13% de branches — acima do piso de 85/75 — enquanto
// `src/lib/mapboxLoader.ts` estava em 0% e `src/components/contacts/ContactForm.tsx` em
// 70,70% de branches (medido em 08/10/2026). Os dois passavam pelo gate: a execução
// completa de 08/10/2026 com o config anterior terminou sem nenhuma linha `ERROR` de limiar.
//
// O SL-123 ligou `perFile: true`, que faz TODO limiar valer arquivo a arquivo (inclusive
// os globais). Este teste trava a regressão: sem `perFile`, ou com o glob do módulo de
// volta ao formato coringa (que arrasta o arquivo em 0%), o gate volta a esconder.
// `mapboxLoader.ts` está FORA do glob de propósito: segue em 0% e tem item próprio no
// inventário (Contatos/Testes mapa, "Teste para src/lib/mapboxLoader.ts"); quando ganhar
// teste, entra no glob e passa a pagar o piso de 85/75 como os vizinhos.

const RAIZ = new URL('../../', import.meta.url);

// Caminho do config sob teste, relativo à raiz do repositório. A variável existe para
// reproduzir a prova "vermelho antes": apontando para a versão ANTERIOR do config
// (`git show HEAD:vitest.config.ts > .tmp/vitest.config.original.ts`), este teste falha.
const CAMINHO = process.env.SL123_CONFIG ?? 'vitest.config.ts';

const config = (await import(new URL(CAMINHO, RAIZ))).default;
const cobertura = config?.test?.coverage;
const limiares = cobertura?.thresholds;

/** Entradas de glob de `coverage.thresholds` (tudo que não é chave de métrica nem perFile). */
const GLOBS = new Set(['lines', 'statements', 'functions', 'branches', 'perFile', 'autoUpdate', '100']);

test('SL-123: cobertura medida POR ARQUIVO (perFile) está ligada', () => {
  assert.ok(limiares, `${CAMINHO}: test.coverage.thresholds não declarado`);
  assert.equal(
    limiares.perFile,
    true,
    `${CAMINHO}: coverage.thresholds.perFile precisa ser true — sem ele o piso volta a ser só agregado por glob e um arquivo abaixo do piso do grupo passa (foi o caso de ContactForm.tsx e mapboxLoader.ts)`,
  );
});

test('SL-123: o glob do módulo do mapa exige o piso por arquivo (linhas 85 / branches 75)', () => {
  const entradas = Object.entries(limiares).filter(([chave]) => !GLOBS.has(chave));
  const doModulo = entradas.filter(([chave]) => chave.includes('location-picker'));
  assert.equal(doModulo.length, 1, `${CAMINHO}: esperava um glob do módulo do mapa em coverage.thresholds`);

  const [glob, piso] = doModulo[0];
  assert.ok(glob.includes('src/lib/mapbox'), `"${glob}": o glob do módulo precisa cobrir os arquivos de src/lib/mapbox*`);
  assert.equal(glob.includes('mapbox*'), false, `"${glob}": o coringa mapbox* arrasta src/lib/mapboxLoader.ts (0% medido) para dentro do piso por arquivo`);
  for (const nome of ['CostGuard', 'Geocode', 'Session', 'Token']) {
    assert.ok(glob.includes(nome), `"${glob}": o glob do módulo precisa cobrir mapbox${nome}.ts`);
  }
  assert.ok(piso.lines >= 85, `"${glob}": piso de linhas caiu para ${piso.lines} (era 85, medido por arquivo em 08/10/2026)`);
  assert.ok(piso.branches >= 75, `"${glob}": piso de branches caiu para ${piso.branches} (era 75, medido por arquivo em 08/10/2026)`);
});

test('SL-123: ContactForm.tsx tem piso PRÓPRIO por arquivo (o grupo escondia o branches dele)', () => {
  const entrada = limiares['src/components/contacts/ContactForm.tsx'];
  assert.ok(entrada, `${CAMINHO}: ContactForm.tsx precisa de entrada própria em coverage.thresholds — medido em 08/10/2026: 85,32% linhas e 70,70% branches, abaixo dos 75% do grupo`);
  assert.ok(entrada.lines >= 85, `ContactForm.tsx: piso de linhas caiu para ${entrada.lines} (medido 85,32)`);
  assert.ok(entrada.branches >= 70, `ContactForm.tsx: piso de branches caiu para ${entrada.branches} (medido 70,70; subir é trabalho da área de telas)`);
});
